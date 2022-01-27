#if 1; 3 wisemen + angel //GRB
    messg 3 wisemen + angel @__LINE__
    constant WM1_CH = #v(LITERAL(1)); RA0
    constant WM2_CH = #v(LITERAL(2)); RA1
    constant WM3_CH = #v(LITERAL(4)); RA2
    constant ANGEL_CH = #v(LITERAL(16)); RA4
    constant WM1_BODY = #v(LITERAL(0x7F007F)); //GRB cyan 50%
    constant WM2_BODY = #v(LITERAL(0x0000FF)); //GRB blue 100%
    constant WM3_BODY = #v(LITERAL(0x007F7F)); //GRB magenta 50%
    constant WM_HEAD = #v(LITERAL(0x5F7F00)); //GRB gold 50%
    constant ANGEL_WINGS = #v(LITERAL(0x5F7F00)); //GRB gold 50%
    constant ANGEL_BODY = #v(LITERAL(0x3F3F30)); //GRB warm white 25%
    constant ANGEL_HAIR = #v(LITERAL(0x7F7F00)); //GRB yellow 50%
    constant ANGEL_HALO = #v(LITERAL(0x5F7F00)); //GRB gold 50%
    constant ANGEL_TRUMPET = #v(LITERAL(0x5F7F00)); //GRB gold 50%
w3a_loop: DROP_CONTEXT;
    ws8_firstpx pxbuf, LITERAL(0), WM1_BODY, WM1_CH;
    ws8_firstpx pxbuf, LITERAL(0), WM2_BODY, WM2_CH;
    ws8_firstpx pxbuf, LITERAL(0), WM3_BODY, WM3_CH;
    ws8_firstpx pxbuf, LITERAL(0), ANGEL_BODY, ANGEL_CH;
;// RLE 176*[1], 64*[3], 60*[4], 20*[2], 23*[5], 7*[7], 40*[6], 7*[7], 23*[5], 144*[2], 1,036*[0]; //0..1599
    ws8_sendpx pxbuf, LITERAL(176), ANGEL_WINGS, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(64), WM_HEAD, WM1_CH | WM2_CH | WM3_CH;
    ws8_sendpx pxbuf, LITERAL(60), ANGEL_WINGS, CHNONE; ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(20), ANGEL_HAIR, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(23), ANGEL_HALO, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(7), ANGEL_TRUMPET, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(40), ANGEL_HALO, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(7), ANGEL_HAIR, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(23), ANGEL_WINGS, ANGEL_CH;
    ws8_sendpx pxbuf, LITERAL(144), LITERAL(0), CHALL;
    WAIT 1 sec;

