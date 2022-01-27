;12V BRG order
    constant RED_FENCE = #v(LITERAL(0x0000A0));
    constant GREEN_FENCE = #v(LITERAL(0x00A000));
    constant WHITE_FENCE = #v(LITERAL(0x505050));
	
    nbDCL16 marque;
;    mov16 marque, LITERAL(0);
other_loop: DROP_CONTEXT;
    mov16 marque, LITERAL(7);
    CALL pole_loop;
    mov16 marque, LITERAL(8);
    CALL pole_loop;
    mov16 marque, LITERAL(9);
    CALL pole_loop;
    mov16 marque, LITERAL(10);
    CALL pole_loop;
    GOTO other_loop;

pole_loop: DROP_CONTEXT;
;fence macro pole_ofs
;    RCandle: 5,
;    RBell: 7,
;    XAndel: 7,
;    RK_camel: 7,
;    K_camel_star: 6,
;    LCandle: 4,
;    RAngel: 6,
    BANKCHK LATA;
    ws8_firstpx pxbuf, LITERAL(0), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(5), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(6), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(4), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(6), GREEN_FENCE, CHALL;
;    K_camel_kneel: 7,
;    MJB_star: 7,
;    Shep2_kneel: 7,
;    LAngel: 6,
;    City: 7,
;    Sheps2_star: 7,
;    LShep: 6,
;    LBell: 5,
;    Joy: 7,
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(6), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(7), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(6), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(5), GREEN_FENCE, CHALL;
;    ws8_sendpx pxbuf, LITERAL(7), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, marque, RED_FENCE, CHALL;
;    pole: 25,
;    if (pole_ofs % 4) < 1
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
;    endif
;    if (pole_ofs % 4) < 2
    ws8_sendpx pxbuf, LITERAL(1), WHITE_FENCE, CHALL;
;    endif
;    if (pole_ofs % 4) < 3
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL;
;    endif
    ws8_sendpx pxbuf, LITERAL(1), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), WHITE_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), WHITE_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), WHITE_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), WHITE_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), WHITE_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), RED_FENCE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FENCE, CHALL;
    WAIT 1 sec/3;
    return;
;
