   messg wisemen @__LINE__
;#undefine UNIV_LEN
;#define UNIV_LEN  400
#define BODY_LEN  #v(LITERAL(12 * 20))
#define HEAD_LEN  #v(LITERAL(18 * 4 - 6 * 2))
    constant GOLD_FULL = #v(LITERAL(0xffbf00));

    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all red
    ws8_sendpx pxbuf, HEAD_LEN, GREEN_FULL, CHALL; all gold
    WAIT 1 sec;/10;
    
    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all green
    ws8_sendpx pxbuf, HEAD_LEN, BLUE_FULL, CHALL; all gold
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all blue
    ws8_sendpx pxbuf, HEAD_LEN, YELLOW_HALF, CHALL; all gold
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all yellow
    ws8_sendpx pxbuf, HEAD_LEN, MAGENTA_HALF, CHALL; all gold
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all magenta
    ws8_sendpx pxbuf, HEAD_LEN, CYAN_HALF, CHALL; all gold
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all cyan
    ws8_sendpx pxbuf, HEAD_LEN, WHITE_THIRD, CHALL; all gold
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, BODY_LEN, GOLD_FULL, CHALL; all white
    ws8_sendpx pxbuf, HEAD_LEN, RED_FULL, CHALL; all gold
    WAIT 1 sec;/10;

