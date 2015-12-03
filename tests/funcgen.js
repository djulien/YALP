
'use strict';

function* do_stuff()
{
  yield 1;
  yield 2;
  console.log('goodbye');
}

var gen = do_stuff();
console.log("first", gen.next().value);
console.log("second", gen.next().value); //This line won't begin execution until the function call on the previous line returns
gen.next();


/*
var delegatedIterator = (function* ()
{
  yield 'Hello!';
  yield 'Bye!';
}());

var delegatingIterator = (function* ()
{
  yield 'Greetings!';
  yield* delegatedIterator;
  yield 'Ok, bye.';
}());

// Prints "Greetings!", "Hello!", "Bye!", "Ok, bye."
for(let value of delegatingIterator)
{
  console.log(value);
}
*/

//eof
