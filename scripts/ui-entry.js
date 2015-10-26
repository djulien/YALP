//ui entry

'use strict';

//dummy entry code to collect up modules for browserify
//require(require.resolve('brace/example/javascript-editor'));
//require('brace/example/javascript-editor');

//just include dependencies here for bundling purposes, and leave main logic in parent:
var ace = require('brace');
require('brace/mode/javascript');
require('brace/theme/monokai');
//require('brace/keybinding/vim');
//ace.require("brace/ext/statusbar");
var StatusBar = require("brace/ext/statusbar").StatusBar;

/*
//logic for parent:
var editor = ace.edit('javascript-editor');
editor.getSession().setMode('ace/mode/javascript');
editor.setTheme('ace/theme/monokai');
editor.setKeyboardHandler('ace/keyboard/vim');
editor.setValue([
    '// JavaScript'
  , 'var a = 3;'
  , ''
  , '// below line has an error which is annotated'
  , 'var b ='
  ].join('\n')
);
editor.clearSelection();
*/

//eof
