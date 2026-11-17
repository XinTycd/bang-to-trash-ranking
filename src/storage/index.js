const { SqliteStore } = require("./sqlite-store");

function createStore(options) {
  return new SqliteStore(options);
}

module.exports = { createStore };
