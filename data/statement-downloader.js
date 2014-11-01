function quoteCSV(s) {
    return '"' + ('' + s).replace(/"/g, '""') + '"';
}


function exporterGenerateCSV(lines) {
    var output = 'Date,Description,Amount,Balance,Comment\n', line;
    $.each(lines, function(i, item) {
        line = [item.date,
                item.description,
                item.amount,
                item.balance,
                item.comment].map(quoteCSV).join(',');
        output += line + '\n';
    });
    return output;
}


function parseAmount(s) {
    console.debug('Parsing amount "' + s + '"');
    var amount = +s.replace(/£|CR|DR/g, '').trim();
    if (s.indexOf('DR') != -1)
        amount = -amount;
    console.debug('   -> ' + amount);
    return amount;
}


function parsePage() {
    // Check title of page
    var title = $('span.H2').text().trim(),
        isRecentItemsPage = (title == 'Recent Items');
    if (title != 'Statement' && title != 'Recent Items') {
        // This is just a warning, assume we're not on the right page
        // rather than that there's an error.
        console.warn('Wrong title: "' + title + '"');
        return null;
    }

    // Get account name, sort code and number
    var accRegex = /^\s*([^0-9]+)\s+(\d\d-\d\d-\d\d)\s+(\d+)\s*$/g,
        creditCardRegex = /^\s*([^0-9]+)\s+(\d+)\s*$/g,
        accountText = $('.field h4').text(),
        match, accountName, accountType, sortCode, accountNumber,
        statementDate, statementType;

    // Try matching as bank account (sortcode, account number)
    if ((match = accRegex.exec(accountText))) {
        accountName = $.trim(match[1]);
        sortCode = match[2].replace(/-/g, '');
        accountNumber = match[3];
        accountType = 'CURRENT ACCOUNT';

        // Statement number & date
        var $pageNumber = $('.field:contains("Page")'),
            statementNumber = $pageNumber.text().replace('Page', '').trim();
        statementDate = $pageNumber
            .next('td')
            .text().replace('Date', '').trim();
        statementType = ((statementNumber.length > 0) ?
                         'Statement' : 'Recent_transactions');

    // Try matching as credit card
    } else if ((match = creditCardRegex.exec(accountText))) {
        accountName = $.trim(match[1]);
        sortCode = '';
        accountNumber = match[2];
        accountType = 'CREDIT CARD';

        // Statement number & date
        var $date = $('.field:contains("Statement Date")'),
        statementDate = $date.next('td').text().trim();
        statementType = 'Statement';

    } else {
        console.debug("Couldn't match account details: '" + accountText + "'");
        return null;
    }

    // Parse the table
    var statementTable = $('th:contains("Transaction")')
            .parents('table').get(0),
        tableRows = $(statementTable).find('tr'),
        last = null;

    var transactions = tableRows.map(function () {
        var $row = $(this),
            date = $row.find('.dataRowL').text().trim(),
            desc = $row.find('.transData').text().trim(),
            values = $row.find('.moneyData').map(function () {
                return parseAmount($(this).text());
            }).get(),
            amount = values[0] - values[1];

        // Lines without date can be extension of previous line
        if (date.length == 0) {
            if (last && last['comment'] == '')
                last['comment'] = desc;
            return null;
        }

        last = {
            'date':        cleanDate(date),
            'description': desc,
            'comment':     '',
            'amount':      amount,
            'balance':     values[2] ? values[2] : ''
        };
        return last;
    }).get();

    if (transactions.length == 0) {
        console.error('No transactions found');
        return null;
    }

    var finalBalance, startDate, endDate;
    if (isRecentItemsPage) {
        var $balance = $('.field:contains("Account Balance")').next('.field');
        finalBalance = parseAmount($balance.text());

        // Recent items are sorted in reverse chronological order
        startDate = transactions[transactions.length - 1].date;
        endDate = transactions[0].date;
        statementDate = endDate;
    } else {
        // Statements are sorted in chronological order
        finalBalance = transactions[transactions.length - 1].balance;
        startDate = transactions[0].date;
        endDate = transactions[transactions.length - 1].date;
    }

    if (finalBalance == '') {
        // Credit card - doesn't have running balance total
        var $balance = $('.field:contains("Statement Balance")').next('.field');
        finalBalance = parseAmount($balance.text());
        transactions[transactions.length - 1].balance = finalBalance;
    }

    return {
        accountName:      accountName,
        accountType:      accountType,
        accountNumber:    accountNumber,
        sortCode:         sortCode,
        transactions:     transactions,
        startDate:        startDate,
        endDate:          endDate,
        statementType:    statementType,
        statementDate:    statementDate,
        statementBalance: finalBalance
    };
}


function cleanAccountName(s) {
    var ls = s.toLowerCase();
    var result = '';
    var lastWasEscaped = false;
    var i;
    for (i = 0; i < s.length; i++) {
        var c = ls.charAt(i);
        if ("abcdefghijklmnopqrstuvwxyz0123456789".indexOf(c) >= 0) {
            var origC = s.charAt(i);
            result = result + origC;
            lastWasEscaped = false;
        } else {
            if (!lastWasEscaped) {
                result += '_';
                lastWasEscaped = true;
            }
        }
    }
    return result;
}


function cleanDate(s) {
    var parts = s.split('/');
    if (parts.length != 3) {
        return s;  // give up
    }
    if (parts[0].length < 2) {
        parts[0] = '0'+parts[0];
    }
    if (parts[1].length < 2) {
        parts[1] = '0'+parts[1];
    }
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}


function downloadFilename(data) {
    var fn = (data.statementType + '_' +
              cleanAccountName(data.accountName) + '_' +
              data.accountNumber + '_' +
              cleanDate(data.statementDate));
    return fn;
}


function addDownloadLink(data) {
    var $p = $('<p>Download:</p>').insertAfter($('.field h4')),
        csv = exporterGenerateCSV(data.transactions),
        uri = 'data:text/csv;base64,' + btoa(csv),
        name = downloadFilename(data);

    $('<a>')
        .attr('download', name + '.csv')
        .attr('href', uri)
        .text('CSV')
        .appendTo($p);
    $p.append($('<br/>'));
    $p.append($('<br/>'));
}


function main() {
    var data = parsePage();
    if (data) {
        console.info("Found " + data.transactions.length +
                     " transactions, adding download link.");
        addDownloadLink(data);
    } else {
        console.info("No transactions found here.");
    }
}


main()
