    constant FENCE_CH = #v(LITERAL(32)); RA5
;12V BRG order
    constant RED_FENCE = #v(LITERAL(0x0000A0)); //BRG red 66%
    constant GREEN_FENCE = #v(LITERAL(0x00A000)); //BRG green 66%

    BANKCHK LATA;
    ws8_firstpx pxbuf, LITERAL(0), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(5), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(6), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(4), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(6), GREEN_FENCE, FENCE_CH;
;    K_camel_kneel: 7,
;    MJB_star: 7,
;    Shep2_kneel: 7,
;    LAngel: 6,
;    City: 7,
;    Sheps2_star: 7,
;    LShep: 6,
;    LBell: 5,
;    Joy: 7,
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(6), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(6), RED_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(5), GREEN_FENCE, FENCE_CH;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, FENCE_CH;
;//    ws8_sendpx pxbuf, marque, RED_FENCE, CHALL;
    WAIT 1 sec;

