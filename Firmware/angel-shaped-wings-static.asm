; angel NEEDS_REPAIR with shaped wings
;//palent[0]: 0x7f0000, #occ 266
;//palent[1]: 0x3f3f36, #occ 176
;//palent[2]: 0x0, #occ 52
;//palent[3]: 0x7f7f00, #occ 46
    constant PAL0 = LITERAL(0x5f7f00);
    constant PAL1 = LITERAL(0x3f3f36);
    constant PAL2 = LITERAL(0);
    constant PAL3 = LITERAL(0x7f7f00);
angel_loop: DROP_CONTEXT;
    ws8_firstpx pxbuf, LITERAL(0), PAL1, CHALL;
;//30 RLE blocks:
; RLE 154*[1], 4*[2], 16*[0], 7*[2], 20*[0], 1*[2], 23*[0], 1*[2], 23*[0], 3*[2], 20*[0], 
    ws8_sendpx pxbuf, LITERAL(154), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(4), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(16), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(20), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(23), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(23), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(3), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(20), PAL2, CHALL;
;    6*[2], 16*[0], 4*[2], 23*[3], 54*[0], 23*[3], 4*[2], 16*[0], 7*[2], 20*[0], 1*[2], 
    ws8_sendpx pxbuf, LITERAL(6), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(16), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(4), PAL3, CHALL;
    ws8_sendpx pxbuf, LITERAL(23), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(54), PAL3, CHALL;
    ws8_sendpx pxbuf, LITERAL(23), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(4), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(16), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(20), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), PAL0, CHALL;
;    23*[0], 1*[2], 23*[0], 3*[2], 20*[0], 6*[2], 16*[0], 4*[2]; //375..541
    ws8_sendpx pxbuf, LITERAL(23), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(23), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(3), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(20), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(6), PAL0, CHALL;
    ws8_sendpx pxbuf, LITERAL(16), PAL2, CHALL;
    ws8_sendpx pxbuf, LITERAL(4), OFF, CHALL;
    WAIT 1 sec
    GOTO angel_loop;

