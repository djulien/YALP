'use strict';

console.log("my id ", require.id);
console.log("my path ", require.filename);
console.log("parent ", require.parent);

module.exports = {name: "ME!"};

//eof
