'use strict';

function fill(model /*:Model*/, color /*:Color*/)
{
    model.nodes.every(function(node, inx) { node.color = color; });
}


module.exports = model_base; //commonjs

//eof
