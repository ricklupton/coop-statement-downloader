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
    // console.log('Parsing amount "' + s + '"');
    var amount, match = /^£?([0-9]+\.[0-9]+)[+-]?$/.exec(s.trim());
    if (match) {
        amount = parseFloat(match[1]);
        if (s.indexOf('-') != -1) {
            amount = -amount;
        }
        // console.log('   -> ' + amount);
        return amount;
    } else {
        return s;
    }
}


function parseTransactionsTable(table) {
    // Parse the table
    var tableRows = $(table).find('tr'),
        last = null, transactions;
    //console.log(table, tableRows);

    transactions = tableRows.map(function () {
        var values, date, desc, amount, balance;

        values = $(this).find('td').map(function () {
            return parseAmount($(this).text());
        }).get();

        if (values.length === 5) {
            amount = values[2] - values[3];
            balance = values[4];
        } else if (values.length === 4) {
            amount = values[2] - values[3];
            balance = '';
        } else if (values.length === 3) {
            amount = values[2];
            balance = '';
        } else {
            return null;
        }
        //console.log(values, amount, balance);
        date = values[0].trim();
        desc = values[1].trim();

        // Lines without date can be extension of previous line
        if (date.length === 0) {
            if (last && last.comment === '') last.comment = desc;
            return null;
        }

        last = {
            'date':        cleanDate(date),
            'description': desc,
            'comment':     '',
            'amount':      amount,
            'balance':     balance
        };
        return last;
    }).get();
    //console.log(transactions);
    return transactions;
}


function fieldText(page, key) {
    var cls = (page.type === 'CREDIT CARD' ? 'td.dataRowL' :
               'td.transactionDataLabel');
    return $(cls + ':contains("' + key + '")').next('td').text().trim();
}


var pageByTitle = {
    'Recent credit card transactions': {type: 'CREDIT CARD', recent: true},
    'Credit card transaction summary': {type: 'CREDIT CARD', recent: false},
    'CURRENT ACCOUNT':                 {type: 'CURRENT ACCOUNT'},
    'CURRENT ACCOUNT PLUS':            {type: 'CURRENT ACCOUNT PLUS'},
    'STUDENT ACCOUNT':                 {type: 'STUDENT ACCOUNT'},
};


function parsePage() {
    // Check title of page
    var title = $('.subHead h2').text().trim(),
        page = pageByTitle[title];
    //console.log('subhead h2', $('.subHead h2')[0]);

    if (!title) {
        // This is just a warning, assume we're not on the right page
        // rather than that there's an error.
        console.warn('Wrong title: "' + title + '"');
        return null;
    }

    // Get account name, sort code and number
    var accountName, sortCode, accountNumber,
        statementDate, statementType;

    var pageRegex = /([^:]+?) statement: Page ([0-9]+)/;

    // Try matching as credit card
    if (page.type === 'CREDIT CARD') {
        accountName = 'Credit card';
        statementNumber = '';
        sortCode = '';
        statementType = 'Statement';

    // Try matching as bank account (sortcode, account number)
    } else {
        var pageMatch = pageRegex.exec($('#recentItemsPageCount').text());
        if (pageMatch) {
            accountName = $.trim(pageMatch[1]);
            statementNumber = pageMatch[2];
            sortCode = fieldText(page, 'Sort code');
            statementType = 'Statement';
            page.recent = false;

        } else {
            // Try looking for recent items
            if ($('.transactionDataLabel:contains("Balance")').length) {
                accountName = title;
                statementNumber = '';
                sortCode = '';
                statementType = 'Statement';
                page.recent = true;
            } else {
                console.warn('Cannot find anything');
                return null;
            }
        }
    }

    statementType = page.recent ? 'Recent_transactions' : 'Statement';
    accountNumber = fieldText(page, 'Account number');
    statementDate = fieldText(page, 'Statement date');

    // Check for recent page with account number and sort code together
    var accSplit = accountNumber.split(" ");
    if (accSplit.length === 2) {
        accountNumber = accSplit[0];
        sortCode = accSplit[1];
    }

    // Parse the table
    var statementTable = $('th:contains("Transaction")')
        .parents('table').get(0);
    var transactions = parseTransactionsTable(statementTable);
    if (transactions.length === 0) {
        console.error('No transactions found');
        return null;
    }

    var finalBalance, startDate, endDate;
    if (page.recent) {
        //console.log('recent page', finalBalance);
        finalBalance = parseAmount(fieldText(page,
                                             (page.type === 'CREDIT CARD' ?
                                              'Current balance' : 'Balance')));

        // Recent items are sorted in reverse chronological order
        transactions.reverse();
    } else {
        // Statements are sorted in chronological order
        //console.log('not recent page', finalBalance,
        //            transactions[transactions.length - 1]);
        finalBalance = transactions[transactions.length - 1].balance;
    }

    startDate = transactions[0].date;
    endDate = transactions[transactions.length - 1].date;

    if (!statementDate) {
        statementDate = endDate;
    }

    if (finalBalance === '') {
        // Credit card - doesn't have running balance total
        finalBalance = parseAmount(fieldText(page, 'Statement balance'));
        transactions[transactions.length - 1].balance = finalBalance;
    }

    var result = {
        accountName:      accountName,
        accountType:      page.type,
        accountNumber:    accountNumber,
        sortCode:         sortCode,
        transactions:     transactions,
        startDate:        startDate,
        endDate:          endDate,
        statementType:    statementType,
        statementDate:    statementDate,
        statementBalance: finalBalance
    };
    //console.log('**', result);
    return result;
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
    $('p#statement-downloader').remove();

    var $p = $('<p>Download:</p>').prependTo($('td.mainContentCell')),
        csv = exporterGenerateCSV(data.transactions),
        uri = 'data:text/csv;base64,' + btoa(csv),
        name = downloadFilename(data);
    //console.log(csv);

    $('<a>')
        .attr('download', name + '.csv')
        .attr('href', uri)
        .text('CSV')
        .appendTo($p);
    $p.append($('<br/>'));
    $p.attr('id', 'statement-downloader');
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


//console.log("Statement downloader running!");
main();
