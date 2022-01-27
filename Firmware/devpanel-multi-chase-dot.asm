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


#define UNIV_LEN  (256-2)
;#define DEVPANEL_CH  BIT(RA0); //RA0, RA1, RA2, RA5
#define ALLPROPS_CH  LITERAL(BIT(RA0) | BIT(RA1) | BIT(RA2) | BIT(RA5));
#define PROP_CH0  LITERAL(BIT(RA0));
#define PROP_CH1  LITERAL(BIT(RA1));
#define PROP_CH2  LITERAL(BIT(RA2));
#define PROP_CH5  LITERAL(BIT(RA5));
#define STATUS_CH  LITERAL(BIT(RA4));
#define ALL_CH  LITERAL(0XFF);
#define NONE_CH  LITERAL(0);

    b0DCL onbuf, :24; //8 parallel 24-bit values (1 for each IO pin)
    display_engine onbuf;
    b0DCL offbuf, :24; //used for variable space at start (~scrolling)
    display_engine offbuf;
;    b0DCL altbuf, :24; //alternate pxbuf
;    display_engine altbuf;
;    doing_init TRUE
;    PBLI pxbuf0; set initial colors
;    DW 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0;
;    doing_init FALSE

ws_player: DROP_CONTEXT;
    messg devpanel dot chase (different color each port) @__LINE__
;//reset colors for new frame
    ws8_firstpx offbuf, LITERAL(0), OFF, ALLPROPS_CH;
    ws8_firstpx onbuf, LITERAL(0), RED_DIM, PROP_CH0;
    ws8_firstpx onbuf, LITERAL(0), GREEN_DIM, PROP_CH1;
    ws8_firstpx onbuf, LITERAL(0), BLUE_DIM, PROP_CH2;
    ws8_firstpx onbuf, LITERAL(0), YELLOW_DIM, PROP_CH5;
//status/heartbeat:    
    b0DCL24 heartbeat_color; //use var so it can be copied to devpanel
heartbeat_loop: DROP_CONTEXT;
    mov24 heartbeat_color, CYAN_DIM;
;    ws8_firstpx onbuf, LITERAL(0), CYAN_DIM, STATUS_CH;
;    ws8_firstpx offbuf, LITERAL(0), CYAN_DIM, STATUS_CH;
    CALL anim;
;    ws8_firstpx onbuf, LITERAL(0), MAGENTA_DIM, STATUS_CH;
;    ws8_firstpx offbuf, LITERAL(0), CYAN_DIM, STATUS_CH;
    mov24 heartbeat_color, MAGENTA_DIM;
    CALL anim;
    GOTO heartbeat_loop;

sub16 macro dest, total, amt
    ERRIF(ISLIT(amt) || !ISLIT(total), TODO: lits/vars @__LINE__)
    mov8 BYTEOF(dest, 1), BYTEOF(total, 1); kludge: no SUBLWB so use SUBWFB with reg :(
    MOVF REGLO(amt), W
    SUBLW (total) & 0xFF;
    MOVWF REGLO(dest);
    MOVF REGHI(amt), W
    SUBWFB REGHI(dest), F;
    endm

ifcmp16 macro reg, bitreg, bitnum, bitval, stmt
    MOVF REGLO(reg), W
    IORWF REGHI(reg), W
    ifbit bitreg, bitnum, bitval, stmt; //EQUALS0 TRUE, GOTO nopad
    endif
    
 messg [TODO] allow set > 1 color- swap pxbuf !retain inline pxbuf changes @__LINE__
 messg [TODO] allow disable port while another drawn @__LINE__
    b0DCL16 dotpad;
anim: DROP_CONTEXT;
    mov16 dotpad, LITERAL(0);
    b0DCL16 univpad;
draw_loop: DROP_CONTEXT;
    sub16 univpad, LITERAL(UNIV_LEN), dotpad;
    ifcmp16 univpad, EQUALS0 TRUE, GOTO nopad
;//RLE blocks: var off, 1 color, univ_len - var off, 1 sentinel
    BANKCHK LATA;
    ws8_firstpx offbuf, dotpad, X, NONE_CH;
    ws8_sendpx onbuf, LITERAL(1), X, NONE_CH;
    ws8_sendpx onbuf, univpad, sentinel, ALLPROPS_CH;
    ws8_sendpx onbuf, LITERAL(1), OFF, ALLPROPS_CH;
    GOTO anim_wait;

nopad: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_firstpx offbuf, dotpad, X, NONE_CH;
    ws8_sendpx onbuf, LITERAL(1), heartbeat_color, ALL_CH;
    ws8_sendpx onbuf, LITERAL(1), OFF, ALLPROPS_CH;

anim_wait: DROP_CONTEXT;
CURRENT_FPS_usec = -1; force timer0 init
    WAIT 1 sec/16
    INCF REGHI(dotpad), F; kludge: allow DECFSZ to catch 0 (not -1)
    DECFSZ REGLO(dotpad), F
    INCF REGHI(dotpad), F ;lower !wrap
    DECFSZ REGHI(dotpad), F
    GOTO draw_loop
    return;

