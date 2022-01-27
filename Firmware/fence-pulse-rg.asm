; fence osc between red + green 63% (0xA0/0xFF), fade for 3 sec then pause for 5 sec
    messg fence red-green fade @__LINE__
;12V BRG order:
;    b0DCL8 pause;
#define FENCE_CH  LITERAL(0x3F & ~0x18);
#define STATUS_CH  LITERAL(0x10);
    b0DCL24 RED_FENCE;
    b0DCL24 GREEN_FENCE;
;    WAIT 1 sec/10; pre-set timer0
;    GOTO not_eof;
;    GOTO fence_anim_eof; skip over RLE frames in prog space
    GOTO rewind;
    constant RLE_FRAMELEN = 3; read 1 RGB value each frame
;    UGLY_PASS12FIX +1;
fence_anim: ;//RLE-encoded bitmaps, 1 per frame; NOTE: symetrical: first half of loop == second in reverse
;TODO: bit-pack to 25 bits: 1 bit pause + 24-bit rgb color; compresses 4:1 words
  DW 0xa0, 0x0, 0x0
  DW 0xa0, 0xa, 0x0
  DW 0xa0, 0x15, 0x0
  DW 0xa0, 0x1f, 0x0
  DW 0xa0, 0x2a, 0x0
  DW 0xa0, 0x35, 0x0
  DW 0xa0, 0x40, 0x0
  DW 0xa0, 0x4a, 0x0
  DW 0xa0, 0x55, 0x0
  DW 0xa0, 0x60, 0x0
  DW 0xa0, 0x6a, 0x0
  DW 0xa0, 0x75, 0x0
  DW 0xa0, 0x80, 0x0
  DW 0xa0, 0x8a, 0x0
  DW 0xa0, 0x95, 0x0
  DW 0xa0, 0xa0, 0x0
  DW 0x95, 0xa0, 0x0
  DW 0x8a, 0xa0, 0x0
  DW 0x7f, 0xa0, 0x0
  DW 0x75, 0xa0, 0x0
  DW 0x6a, 0xa0, 0x0
  DW 0x60, 0xa0, 0x0
  DW 0x55, 0xa0, 0x0
  DW 0x4a, 0xa0, 0x0
  DW 0x3f, 0xa0, 0x0
  DW 0x35, 0xa0, 0x0
  DW 0x2a, 0xa0, 0x0
  DW 0x20, 0xa0, 0x0
  DW 0x15, 0xa0, 0x0
  DW 0xa, 0xa0, 0x0
;fence_anim_pause:
  DW 0x0, 0xa0, 0x0
  DW 0xa, 0xa0, 0x0
  DW 0x15, 0xa0, 0x0
  DW 0x20, 0xa0, 0x0
  DW 0x2a, 0xa0, 0x0
  DW 0x35, 0xa0, 0x0
  DW 0x3f, 0xa0, 0x0
  DW 0x4a, 0xa0, 0x0
  DW 0x55, 0xa0, 0x0
  DW 0x60, 0xa0, 0x0
  DW 0x6a, 0xa0, 0x0
  DW 0x75, 0xa0, 0x0
  DW 0x7f, 0xa0, 0x0
  DW 0x8a, 0xa0, 0x0
  DW 0x95, 0xa0, 0x0
  DW 0xa0, 0xa0, 0x0
  DW 0xa0, 0x95, 0x0
  DW 0xa0, 0x8a, 0x0
  DW 0xa0, 0x80, 0x0
  DW 0xa0, 0x75, 0x0
  DW 0xa0, 0x6a, 0x0
  DW 0xa0, 0x60, 0x0
  DW 0xa0, 0x55, 0x0
  DW 0xa0, 0x4a, 0x0
  DW 0xa0, 0x40, 0x0
  DW 0xa0, 0x35, 0x0
  DW 0xa0, 0x2a, 0x0
  DW 0xa0, 0x1f, 0x0
  DW 0xa0, 0x15, 0x0
  DW 0xa0, 0xa, 0x0
;  DW 0xa0, 0x0, 0x0
fence_anim_eof: ;NOTE: next entry should match first for smooth anim loop
    constant anim_size = fence_anim_eof - fence_anim;
    constant NUM_FRAMES = anim_size / RLE_FRAMELEN;
    b0DCL8 counter;
    ERRIF(anim_size % RLE_FRAMELEN, [ERROR] RLE contains incomplete entry: len #v(anim_size)"," entry len: #v(RLE_FRAMELEN)"," fragment: #v(anim_size % RLE_FRAMELEN)) @__LINE__
;    mov16 FSR1, LITERAL(fence_anim_eof | 0x8000); pre-set eof; read prog space
;    GOTO rewind;
;fence_loop_fwd: DROP_CONTEXT;
;instead, render with sequencing software and just play back RLE-encoded bitmaps here:
rewind: DROP_CONTEXT;
    mov16 FSR1, LITERAL(fence_anim | 0x8000); rewind
    mov8 counter, LITERAL(NUM_FRAMES / 2);
    ws8_firstpx pxbuf, LITERAL(0), LITERAL(0x010000), STATUS_CH; heartbeat
;    ws8_firstpx pxbuf, LITERAL(0), LITERAL(0), FENCE_CH; set color for new frame
;    ws8_sendpx pxbuf, LITERAL(150), GREEN_FENCE, FENCE_CH;
CURRENT_FPS_usec = -1; force timer0 re-init below
    WAIT 5 sec; pause @eof
;    WAIT 1 sec/10; pre-set for anim delay
not_eof: DROP_CONTEXT;
    messg [TODO] generalize into RLE-decode, RLE-playback @__LINE__
;    mov16 FSR0, LITERAL(treelen_#v(0))
;    b0DCL8 rle_decode_count;
;    mov8 rle_decode_count, LITERAL(RLE_FRAMELEN);
;rle_decode_loop: DROP_CONTEXT;
;    mov8 INFD0_postinc, INDF1_postinc;
;NOTE: 12V is BGR
;red and blue:
;    mov8 REGHI(RED_FENCE), INDF1_postinc;
;    mov8 REGMID(GREEN_FENCE), WREG; R <-> G
;    mov8 REGMID(RED_FENCE), INDF1_postinc;
;    mov8 REGHI(GREEN_FENCE), WREG; R <-> G
;    mov8 REGLO(RED_FENCE), INDF1_postinc;
;    mov8 REGLO(GREEN_FENCE), WREG; B ==
;green and blue:
;    mov8 REGLO(RED_FENCE), INDF1_postinc;
;    mov8 REGHI(GREEN_FENCE), WREG; R <-> G
;    mov8 REGHI(RED_FENCE), INDF1_postinc;
;    mov8 REGLO(GREEN_FENCE), WREG; R <-> G
;    mov8 REGMID(RED_FENCE), INDF1_postinc;
;    mov8 REGMID(GREEN_FENCE), WREG; B ==
;red and green:
    mov8 REGMID(RED_FENCE), INDF1_postinc;
    mov8 REGLO(GREEN_FENCE), WREG; R <-> G
    mov8 REGLO(RED_FENCE), INDF1_postinc;
    mov8 REGMID(GREEN_FENCE), WREG; R <-> G
    mov8 REGHI(RED_FENCE), INDF1_postinc;
    mov8 REGHI(GREEN_FENCE), WREG; R <-> G
;    mov8 pause, INDF1_postinc;
;    DECFSZ rle_decode_count, F;
;    GOTO rle_decode_loop;
    CALL draw;
    DECFSZ counter, F;
    GOTO no_pause;
;    ws8_firstpx pxbuf, LITERAL(0), LITERAL(0), FENCE_CH; set color for new frame
;    ws8_sendpx pxbuf, LITERAL(150), GREEN_FENCE, FENCE_CH;
CURRENT_FPS_usec = -1; force timer0 re-init below
    ws8_firstpx pxbuf, LITERAL(0), LITERAL(0x000100), STATUS_CH; heartbeat
    WAIT 5 sec; pause @eof
;    WAIT 1 sec/10; pre-set for anim delay
no_pause: DROP_CONTEXT;
    MOVF REGLO(FSR1), W;
    XORLW (fence_anim_eof | 0x8000) & 0xFF;
    ifbit EQUALS0 FALSE, GOTO not_eof;
    MOVF REGHI(FSR1), W;
    XORLW ((fence_anim_eof | 0x8000) >> 8) & 0xFF;
    ifbit EQUALS0 FALSE, GOTO not_eof;
    GOTO rewind;
    
draw: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_firstpx pxbuf, LITERAL(0), RED_FENCE, FENCE_CH; set color for new frame
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
    messg [TODO] should render heavy fx for next frame < wait !> wait @__LINE__
    WAIT 1 sec/5;
;loop control:
;    MOVF pause, W;
;    ifbit EQUALS0 TRUE, GOTO fence_loop;
;    DECFSZ fade, F
;    GOTO fence_loop;
    return;

