;Mary + Joseph + manger + tree, needs anim
    messg Mary + Joseph + manger + tree, needs anim @__LINE__

;RGB colors:
    constant OFF = LITERAL(0);
    constant X = LITERAL(0); //don't care/ignored
#if 1; dim
    constant RED = LITERAL(0x030000);
    constant GREEN = LITERAL(0x000300);
    constant BLUE = LITERAL(0x000003);
    constant YELLOW = LITERAL(0x020200);
    constant CYAN = LITERAL(0x000202);
    constant MAGENTA = LITERAL(0x020002);
    constant WHITE = LITERAL(0x010101);
#else; full
    constant RED = LITERAL(0xFF0000);
    constant GREEN = LITERAL(0x00FF00);
    constant BLUE = LITERAL(0x0000FF);
    constant YELLOW = LITERAL(0x7F7F00);
    constant CYAN = LITERAL(0x007F7F);
    constant MAGENTA = LITERAL(0x7F007F);
    constant WHITE = LITERAL(0x555555);
#endif;

;//palent[0]: 0x7f0000, #occ 266
;//palent[1]: 0x3f3f36, #occ 176
;//palent[2]: 0x0, #occ 52
;//palent[3]: 0x7f7f00, #occ 46
;//angel colors:
;    constant PAL0 = LITERAL(0x5f7f00);
;    constant PAL1 = LITERAL(0x3f3f36);
;    constant PAL2 = LITERAL(0);
;    constant PAL3 = LITERAL(0x7f7f00);
;    constant ANGEL_WINGS = #v(LITERAL(0x4F6F00)); //GRB gold 40%
;    constant ANGEL_BODY = #v(LITERAL(0x2F2F20)); //GRB warm white 20%
;    constant ANGEL_HAIR = #v(LITERAL(0x6F6F00)); //GRB yellow 45%
;    constant ANGEL_HALO = #v(LITERAL(0x4F6F00)); //GRB gold 40%
;    constant ANGEL_TRUMPET = #v(LITERAL(0x5F7F00)); //GRB gold 50%
;    constant TRIM = #v(LITERAL(0))
;//heartbeat:
    constant HB_EVEN = LITERAL(0x010000);
    constant HB_ODD = LITERAL(0x000100);
;//prop colors:
    constant MARY_BODY = #v(LITERAL(0x6F0000)); //RGB red 45%
    constant MARY_HOOD = #v(LITERAL(0x2F2F20)); //RGB warm white 20%
    constant JOSEPH_BODY = #v(LITERAL(0x00006F)); //RGB blue 45%
    constant JOSEPH_HOOD = #v(LITERAL(0x2F2F20)); //RGB warm white 20%
    constant MANGER_BASKET = #v(LITERAL(0x6F6F00)); //RGB yellow 45%
    constant MANGER_LEGS = #v(LITERAL(0x4F2F00)); //RGB brown 30%
    constant TREE_BRANCHES = #v(LITERAL(0x00bf00)); //RGB forest green 75%
    constant TREE_DRIP = #v(LITERAL(0xbfffff)); RGB ice white 100%
    
;#define DEVPANEL_CH  BIT(RA0); //RA0, RA1, RA2, RA5
#define ALLPROPS_CH  #v(LITERAL(BIT(RA0) | BIT(RA1) | BIT(RA2) | BIT(RA5)));
#define PROP_CH0  #v(LITERAL(BIT(RA0)));
#define PROP_CH1  #v(LITERAL(BIT(RA1)));
#define PROP_CH2  #v(LITERAL(BIT(RA2)));
#define PROP_CH5  #v(LITERAL(BIT(RA5)));
#define STATUS_CH  #v(LITERAL(BIT(RA4)));
#define ALL_CH  #v(LITERAL(0XFF));
#define NONE_CH  #v(LITERAL(0));

#define MARY_CH  PROP_CH0
#define JOSEPH_CH  PROP_CH1
#define MANGER_CH  PROP_CH2
#define TREE_CH  PROP_CH5

    b0DCL pxbuf, :24; //8 parallel 24-bit values (1 for each IO pin)
    display_engine pxbuf;
;    doing_init TRUE
;    PBLI pxbuf; set initial colors
;    DW 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0;


ws_player: DROP_CONTEXT;
CURRENT_FPS_usec = -1; force timer0 init
    WAIT 5 sec; give power time to settle
player_loop: DROP_CONTEXT;
    ws8_firstpx pxbuf, LITERAL(0), HB_EVEN, STATUS_CH; heartbeat
    CALL anim;
    ws8_firstpx pxbuf, LITERAL(0), HB_ODD, STATUS_CH; heartbeat
    CALL anim;
    GOTO player_loop

    b0DCL16 drip;
anim: DROP_CONTEXT;
#if 0; TODO
    mov16 drip, LITERAL(9 * 33 + 4 - 300);
    CALL drip_down;
    mov16 drip, LITERAL(15 * 33 + 4 - 300);
    CALL drip_down;
    mov16 drip, LITERAL(11 * 33 + 4 - 300);
    CALL drip_down;
    mov16 drip, LITERAL(12 * 33 + 4 - 300);
    CALL drip_up;
    mov16 drip, LITERAL(16 * 33 + 4 - 300);
    CALL drip_down;
    mov16 drip, LITERAL(13 * 33 + 4 - 300);
    CALL drip_up;
    mov16 drip, LITERAL(14 * 33 + 4 - 300);
    CALL drip_up;
    GOTO anim;

    b0DCL8 count;
drip_down: CONTEXT_DROP;
    mov8 count, LITERAL(33);
#endif

draw: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_firstpx pxbuf, LITERAL(0), MARY_BODY, MARY_CH
    ws8_firstpx pxbuf, LITERAL(0), JOSEPH_BODY, JOSEPH_CH
    ws8_firstpx pxbuf, LITERAL(0), MANGER_BASKET, MANGER_CH
    ws8_firstpx pxbuf, LITERAL(0), TREE_BRANCHES, TREE_CH; set color for new frame
;//8 RLE blocks:
;// RLE 100*[2], 48*[5], 68*[3], 12*[6], 68*[4], 4*[7], 492*[1], 808*[0]; //0..1599
    ws8_sendpx pxbuf, LITERAL(100), MANGER_LEGS, MANGER_CH;
    ws8_sendpx pxbuf, LITERAL(48), OFF, MANGER_CH;
    ws8_sendpx pxbuf, LITERAL(68), MARY_HOOD, MARY_CH;
    ws8_sendpx pxbuf, LITERAL(12), JOSEPH_HOOD, JOSEPH_CH;
    ws8_sendpx pxbuf, LITERAL(68), OFF, MARY_CH;
    ws8_sendpx pxbuf, LITERAL(4), OFF, JOSEPH_CH;
#if 1; no anim
    ws8_sendpx pxbuf, LITERAL(492), OFF, TREE_CH;
#else; tree drip anim
    ws8_sendpx pxbuf, drip, TREE_SNOW, TREE_CH; drip >= 300 to not interfere with MJB
    ws8_sendpx pxbuf, LITERAL(2), TREE_BRANCHES, TREE_CH;
    ws8_sendpx pxbuf, LITERAL(492), OFF, TREE_CH; overshoot ignored
#endif
CURRENT_FPS_usec = -1; force timer0 init
    WAIT 1 sec
    return;

