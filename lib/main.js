var data = require("sdk/self").data;
var pageMod = require("sdk/page-mod");

pageMod.PageMod({
  include: "https://personal.co-operativebank.co.uk/CBIBSWeb/*",
  attachTo: ["existing", "top"],
  contentScriptFile: [data.url("jquery.min.js"),
                      data.url("statement-downloader.js")]
});
