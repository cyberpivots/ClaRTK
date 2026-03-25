const path = require("path");

module.exports = {
  projectRoot: __dirname,
  watchFolders: [
    path.resolve(__dirname, "../../packages"),
    path.resolve(__dirname, "../../contracts")
  ]
};

