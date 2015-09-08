'use strict';

//var ModelBase = require('./model-base');

function drop(model /*:ModelBase*/)
{
//    modelthis.xform = null;
//    this.xlate = [0, 0, 0];
    model.nodes = [];
//    return this; //chainable
    return true;
}

function rect(model /*:ModelBase*/, cols /*:int*/, rows /*:int*/)
{
/*
    model.drop();
    for (var x = 0; x < cols; ++x)
        for (var y = 0; y < rows; ++y)
            model.nodes
*/
    model.pixel = function(x, y, color)
    {
    }
    model.nodes.splice(0, 0, cols * rows);
}


//eof
