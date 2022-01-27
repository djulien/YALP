    title  "WS281X-Splitter - WS281X segment splitter/breakout/debug for Microchip PIC"
;see also ~/Doc*s/mydev/_xmas2014/src/firmware, ~/Doc*s/ESOL-fog/src/Ren*Chipi*Firmware
;================================================================================
; File:     wssplitter.asm
; Date:     8/11/2021
; Version:  0.21.10
; Author:   djulien@thejuliens.net, (c)2021 djulien@thejuliens.net
; Device:   PIC16F15313 (midrange Microchip 8-pin PIC) or equivalent running @8 MIPS
; Peripherals used: Timer0, Timer1 (gated), Timer2, no-MSSP, EUSART, no-PWM, CLC
; Compiler: mpasmx(v5.35), NOT pic-as; NOTE: custom build line is used for source code fixups
; IDE:      MPLABX v5.35 (last one to include mpasm)
; Description:
;   WS281X-Splitter can be used for the following purposes:
;   1. split a single WS281X data stream into <= 4 separate segments; 
;     creates a virtual daisy chain of LED strings instead of using null pixels between
;   2. debugger or signal integrity checker; show 24-bit WS pixel data at end of string
;   3. timing checker; display frame rate (FPS received); alternating color is used as heartbeat
; Build instructions:
;no   ?Add this line in the project properties box, pic-as Global Options -> Additional options:
;no   -Wa,-a -Wl,-pPor_Vec=0h,-pIsr_Vec=4h
;   - use PICKit2 or 3 or equivalent programmer (PICKit2 requires PICKitPlus for newer PICs)
; Wiring:
;  RA0 = debug output (32 px WS281X):
;        - first 24 px shows segment 1/2/3 quad px length (0 = 1K)
;        - next 8 px = FPS (255 max), msb first
;  RA1 = output segment 1
;  RA2 = output segment 2
;  RA3 = WS281X input stream
;        - first/second/third byte = segment 1/2/3 quad pixel length
;	 - first segment data follows immediately
;  RA4 = output segment 4; receives anything after segment 1/2/3
;  RA5 = output segment 3
; TODO:
;  - use PPS to set RA3 as segment 3 out and RA5 as WS input?
;  - uart bootloader; ground segment 0 out to enable? auto-baud detect; verify
;  - custom pixel dup/skip, enforce max brightness limit?
;================================================================================
    NOLIST; reduce clutter in .LST file
;NOTE: ./Makefile += AWK, GREP
;test controller: SP108E_3E6F0D
;check nested #if/#else/#endif: grep -vn ";#" this-file | grep -e "#if" -e "#else" -e "#endif"
;or:    sed 's/;.*//' < ~/MP*/ws*/wssplitter.asm | grep -n -e " if " -e " else" -e " end" -e " macro" -e " while "
;grep -viE '^ +((M|[0-9]+) +)?(EXPAND|EXITM|LIST)([ ;_]|$$)'  ./build/${ConfName}/${IMAGE_TYPE}/wssplitter.o.lst > wssplitter.LST
    EXPAND; show macro expansions
#ifndef HOIST
#define HOIST  0
#include __FILE__; self
    messg no hoist, app config/defs @47
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;//compile-time options:
;#define BITBANG; //dev/test only
;;#define SPI_TEST
#define WANT_DEBUG; //DEV/TEST ONLY!
;#define WANT_ISR; //ISR not used; uncomment to reserve space for ISR (or jump to)
#define WSBIT_FREQ  (800 KHz); //WS281X "high" speed
#define WSLATCH  (50 -20 usec); //end-of-frame latch time; "cheat" by using shorter interval and use the extra time for processing overhead
;#define MAX_THREADS  2; //anim xmit or frame rcv, breakout xmit
#define FOSC_FREQ  (32 MHz); //max speed; NOTE: SPI 3x requires max speed, otherwise lower speed might work

;//pin assignments:
#define WSDI  RA3; //RA3 = WS input stream (from controller or previous WS281X pixels)
#define BREAKOUT  RA0; //RA0 = WS breakout pixels, or simple LED for dev/debug
#define LEDOUT  IIFDEBUG(SEG4OUT, -1); //RA5 = simple LED output; ONLY FOR DEV/DEBUG
;#define WSCLK  4-2; //RA4 = WS input clock (recovered from WS input data signal); EUSART sync rcv clock needs a real I/O pin?
#define SEG1OUT  RA1; //RA1 = WS output segment 1
#define SEG2OUT  RA2; //RA2 = WS output segment 2
#define SEG3OUT  RA#v(3+2); //RA5 = WS output segment 3; RA3 is input-only, use alternate pin for segment 3
#define SEG4OUT  RA4; //RA4 = WS output segment 4
;#define RGSWAP  0x321; //3 = R, 2 = G, 1 = B; default = 0x321 = RGB
#define RGSWAP  0x231; //3 = R, 2 = G, 1 = B; default = 0x321 = RGB
;//             default    test strip
;//order 0x123: RGBYMCW => BRGMCYW
;//order 0x132: RGBYMCW => RBGMYCW
;//order 0x213: RGBYMCW => BGRCMYW
;//order 0x231: RGBYMCW => RGBYMCW ==
;//order 0x312: RGBYMCW => GBRCYMW
;//order 0x321: RGBYMCW => GRBYCMW
 messg [TODO] R is sending blue(3rd byte), G is sending red(first byte), B is sending green(second byte)
;test strip is GRB order

    EXPAND_POP
    LIST_POP
    messg end of !hoist @85
#undefine HOIST; //preserve state for plumbing @eof
#else
#if HOIST == 4; //TODO hack: simplified 8-bit parallel wsplayer
    messg hoist 4: HACK: 8-bit parallel wsplayer @89
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; 8-bit parallel wsplayer ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#define PXOUT  RA0
#define UNIV_LEN  1600/100; //33; //10; //<= 2x banked GPRAM (for in-memory bitmaps), else prog space
;#define RGB_ORDER  213; //0x213; //GRB (normal is 0x123 = RGB)
#define WS_ENV  235; // 2/3/5 @ 8MIPS completely meets WS2811 + WS2812 specs
;//#define WS_ENV  334; //make start pulse longer

#ifdef LEDOUT
 #undefine LEDOUT
#endif
#define LEDOUT  RA4


idler_pad macro which
    if $ != CONTEXT_ADDR(wsbit_idler#v(which)) + which
	NOPNZ CONTEXT_ADDR(wsbit_idler#v(which)) + which - $;
    endif
    endm

;send 1 WS data bit to each IO pin:
;bits are assumed to be in WREG
;2/3/5 is the ideal instr env @8 MIPS- conforms strictly to WS2811 *and* WS2812 timing specs
;2/3/5 env uses 30% CPU time (3 instr), leaves 70% for caller (7 instr)
;chainable- last 4 instr of env time (idle) are typically used for call/return, loop control, or other glue logic
;earlier 1-3 instr of idle env time are typically used for data prep
;heavy rendering typically must be done between outside WS env (while waiting on timer for next frame) - there's not enough time during WS env except for the most trivial rendering
;    doing_init TRUE
;not needed: IO pin init does this
;    mov8 LATA, LITERAL(0); //start with WS data lines low; NOTE: this is required for correct send startup
;    doing_init FALSE
;ws8_sendbit_wreg macro glue_reserved
;    ws8_sendbit ORG$, ORG$, NOP #v(4 - ABS(glue_reserved))
;    endm
;    VARIABLE IDLER = -1; tell idler which timeslot it's in
    messg [TODO] use !nop instr for fill (for easier code layout bug detection)
ws8_sendbit macro idler1, idler2, idler4
    ERRIF((WS_ENV != 235) || (FOSC_FREQ != 8 MIPS), [ERROR] WS envelope WS_ENV !implemented @ fosc FOSC_FREQ - use 235 @8MIPS @__LINE__)
    COMF LATA, F; //bit start; CAUTION: LATA must be 0 prior (which it should be)
;    ORG $+1; placeholder
;    LOCAL here1 = $
    CONTEXT_SAVE wsbit_idler1
;IDLER = 1
    idler1; need to load WREG here if not already loaded
;    nopif $ == CONTEXT_ADDR(wsbit_idler1), 1
    if $ == CONTEXT_ADDR(wsbit_idler1)
	NOPNZ 1
    endif
    MOVWF LATA; //bit data
;    ORG $+2; placeholder
;    LOCAL here2 = $
    CONTEXT_SAVE wsbit_idler2
;IDLER = 2
    idler2; CAUTION: must preserve BSR
    nopif $ == CONTEXT_ADDR(wsbit_idler2), 2
    CLRF LATA; //bit end
;    ORG $+4; placeholder
;    LOCAL here4 = $
    CONTEXT_SAVE wsbit_idler4
;IDLER = 4
    idler4; CAUTION: must preserve BSR
    nopif $ == CONTEXT_ADDR(wsbit_idler4), 4
;IDLER = -1
    CONTEXT_SAVE wsbit_after
    endm


;display "engine":
;uses a "control block" to send WS data to 8 IO pins in parallel
;control block is a struct supplied by caller, contains a 24-bit value for each IO pin (24 bytes total)
;caller can have multiple control blocks, tells engine which to use (need separate code expansions due to direct addressing)
;TODO?: convert to indirect addressing and consolidate code expansion
;rendering engine updates send count, loops until all WS pixels sent
;1 or more (mask) rgb values are also updated *after* sending all px (prep for next display frame)
;this allows display commands to be "chained" into a larger display sequence
;display commands are chainable, but caller must inline first few WS bits when using custom logic betweem WS nodes
;rendering engine loops until all pixels sent (returns 1 WS node early for custom flow control)
;NOTE: caller can inline bits from first node to reclaim busy-wait time for custom setup logic
;rendering engine applies state changes while sending last node (double-buffering !needed)
;rendering engine also maintains global state:
;    BITDCL WS_EOF; HAS_WSDATA; flag telling if xmit is in progress (also used for eof flag)
;    b0DCL engine_loop,; internal WS bit loop to reduce code space
    b0DCL engine_mask,; rgb channel update mask
    b0DCL24 engine_rgb; new rgb value to update
    b0DCL16 engine_count; #WS px remaining to be sent
    b0DCL engine_mask_apply,; working copy; set to 0 to disable rgb updates
    b0DCL engine_last_bit,; save last bit while being updated (so double-buffering !needed)
;    b0DCL engine_pxbuf, :24; rgb values for each IO pin
;below are lambda-like wrappers for ws_sendbit (so mpasm sees consistent params to ws_sendbit)
;idler macros to save caller params:
;save_mask macro mask; idler2
;;    if IDLER == 2
;    LOCAL here = $
;    mov8 engine_mask, mask
;    nopif $ != here+2, here+2 - $
;;    endif
;    endm
;save_rgb macro newrgb; split to fit into idler2/idler4 timeslots
;    LOCAL here = $
;    if IDLER == 2
;	mov8 BYTEOF(engine_rgb, 0), BYTEOF(newrgb, 0);
;	nopif $ != here+2, here+2 - $
;;    endif
;;    if IDLER == 4
;    else; idler 4
;;	mov16 engine_rgb, newrgb
;	mov8 BYTEOF(engine_rgb, 1), BYTEOF(newrgb, 1);
;	mov8 BYTEOF(engine_rgb, 2), BYTEOF(newrgb, 2);
;	nopif $ != here+4, here+4 - $
;    endif
;    endm
;save_count macro count; idler4
;;    if IDLER == 4
;    LOCAL here = $
;    mov16 engine_count, count;
;    nopif $ != here+4, here+4 - $
;;    endif
;    endm
;idler to (pre-)load next WS bit to send:
;load_bit macro bitnum; idler1
;;    MOVIW +bitnum[FSR_send]
;    if bitnum < 24
;        MOVF PXBUF + bitnum, W
;    else
;        MOVF engine_last_bit, W; temp save last bit
;    endif
;    if IDLER == 2
;	MOVWF engine_last_bit; use saved copy of last bit
;    endif
;    endm
;idler for flow control:
;loop_setup macro count
;    if IDLER == 2
;	mov8 engine_loop, LITERAL(count); #WS bits to send in loop
;    else; idler4
;	mov16 FSR1, LITERAL(FSR_send + count); #WS bits already sent
;    endif
;    endm
;idlers to update engine state:
;upd_count macro send_next_nop1; split to fit into idler2/idler4 timeslots
;    if IDLER == 2
;        DECFSZ REGLO(engine_count), F; //REGLO(count), F; //WREG, F
;	INCF REGHI(engine_count), F; kludge: cancels out later DECF upper count byte
;    else; idler4 timeslot
;	if send_next_nop1; commit updated count and send another node
;;        setbit BITPARENT(HAS_WSDATA), TRUE; assume eof
;;	    NOP 1
;	    DECFSZ REGHI(engine_count), F; //REGLO(count), F; //WREG, F
;;        setbit BITPARENT(HAS_WSDATA), FALSE; not eof
;	    GOTO send_next_nop1; not eof
;	    return; NOP 1
;	else; just check for eof (disable rgb update) and continue
;	    mov8 engine_mask_apply, engine_mask
;	    DECFSZ REGHI(engine_count), W; //REGLO(count), F; //WREG, F
;	    CLRF engine_mask_apply; postpone rgb update until eof
;	endif
;    endif
;    endm
;bit-remove old rgb data by setting bits ON
remove_old macro bitnum; idler2
;    if IDLER == 2
    MOVF engine_mask_apply, W; which bits to replace
    BANKSAFE dest_arg(F) IORWF PXBUF + bitnum;, F; INDF_send, F; preset new bits ON (allows XOR to turn them off again without reloading WREG)
;    else; idler4; NOTE: mask already loaded
;	if bitnum < 0
;	    NOP 2
;	else
;	    BANKSAFE dest_arg(F) IORWF PXBUF + bitnum + 0;, F;
;	    BANKSAFE dest_arg(F) IORWF PXBUF + bitnum + 1;, F;
;	endif
;	BANKSAFE dest_arg(F) IORWF PXBUF + bitnum + 2;, F;
;        BANKSAFE dest_arg(F) IORWF PXBUF + bitnum + 3;, F;
;    endif
    endm
;bit-merge in new rgb data by turning bits OFF
insert_new macro bitnum; idler4
;    MOVF chmask, W; need to load mask for first channel
 ;NOTE: WREG is already loaded by previous remove_old
;    if bitnum < 0
;	remove_old -2; remove a couple instead of insert
;    else
    ifbit engine_rgb + (bitnum / 8), 7 - (bitnum % 8), FALSE, BANKSAFE dest_arg(F) XORWF PXBUF + bitnum; INDF_send
;    endif
;    if bitnum + 1 < 24
    ifbit engine_rgb + ((bitnum + 1) / 8), 7 - ((bitnum + 1) % 8), FALSE, BANKSAFE dest_arg(F) XORWF PXBUF + bitnum + 1; INDF_send
;    endif
;    else; back to caller after last bit
;        return;
    endm
;display engine entry point(s):
;code must be expanded for each pxbuf (due to direct addressing)
    messg [TODO] add pxbuf rotate / FSR option to allow fast color changes?
    messg [TODO] swap every other and use 4-bit wide pxbuf instead of 8 (saves memory)
    VARIABLE PXBUF;
display_engine macro pxbuf
    BANKCHK LATA; caller must set BSR; makes timing uniform in here
    messg [TODO] repl PXBUF with BITVAR = bitaddr * 8 + bitnum @__LINE__
PXBUF = pxbuf; kludge: pass to idlers
;#define FSR_send  pxbuf0; FSR0; FSR0 dedicated to WS send; points to control block
;#define INDF_send  INDF0; FSR0 dedicated to WS send; points to control block
;fall thru to send#v(24)
;start of next WS node (24 WS data bits):
;ws8_send_more_nodes: ws8_sendbit MOVIW FSR1++, upd_count ws8_send_more_nodes, upd_count ws8_send_more_nodes; expands loop above if !eof
;first 5 bits are generic and can be custom inlined in caller:
;ws8_send#v(24)bits: ws8_sendbit MOVIW +0[FSR_send], ORG$, ORG$;
ws8_send_next_using_#v(pxbuf)_nop1: NOPNZ 1; use up idler4 residue then send next node
ws8_send#v(24)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+0, ORG$, ORG$; load_bit 0, ORG$, ORG$;
ws8_send#v(23)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+1, ORG$, ORG$;
#if 1; allows caller to inline more, doesn't trash FSR1
ws8_send#v(22)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+2, ORG$, ORG$;
ws8_send#v(21)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+3, ORG$, ORG$;
ws8_send#v(20)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+4, ORG$, ORG$;
ws8_send#v(19)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+5, ORG$, ORG$;
ws8_send#v(18)bits_using_#v(pxbuf): ws8_sendbit LODW pxbuf+6, ORG$, ORG$;
#else; save a little code space by consolidating generic bit-sends into a loop:
ws8_send#v(17)bits_using_#v(pxbuf): ws8_sendbit load_bit 7, EMITL ws8_send#v(22)half_bits_using_#v(pxbuf0): loop_setup 24-20+1, loop_setup 24-22+1; #bits to send (during loop below), #sent already
ws8_send_more_bits_using_#v(pxbuf): ws8_sendbit MOVIW FSR1++, ORG$, dest_arg(W) MOVF engine_mask;
    PAGECHK ws8_send_more_bits; do this before decfsz
    DECFSZ engine_loop, F
    GOTO ws8_send_more_bits;
    MOVWF engine_mask_apply;
#endif
;update send count + disable rgb update if !eof:
;ws8_send#v(15)bits_from_#v(pxbuf0):
;    ws8_sendbit load_bit 7, upd_count 0, upd_count 0
    ws8_sendbit LODW pxbuf+7, ORG$+2, ORG$+4
    CONTEXT_RESTORE wsbit_idler2
        DECFSZ REGLO(engine_count), F; //REGLO(count), F; //WREG, F
	INCF REGHI(engine_count), F; kludge: cancels out later DECF upper count byte
    CONTEXT_RESTORE wsbit_idler4
	mov8 engine_mask_apply, engine_mask
	DECFSZ REGHI(engine_count), W; //REGLO(count), F; //WREG, F; CAUTION: don't update- need to check again at bottom of loop
	CLRF engine_mask_apply; postpone rgb update until eof
    CONTEXT_RESTORE wsbit_after
;remove old rgb value + insert new (controlled by mask):
;CAUTION: don't alter bits < display (else double-buffering needed)
    ws8_sendbit LODW pxbuf+8, ORG$+2, ORG$+4; copy_bit 23, remove_old 0..1
    CONTEXT_RESTORE wsbit_idler2
	MOVF pxbuf+23, W
	MOVWF engine_last_bit; save last rgb bit so it can be changed < display
    CONTEXT_RESTORE wsbit_idler4
        MOVF engine_mask_apply, W; which bits to replace
	IORWF pxbuf+0, F; INDF_send, F; preset new bits ON (allows XOR to turn them off again without reloading WREG)
	IORWF pxbuf+23, F;
	NOPNZ 1
    CONTEXT_RESTORE wsbit_after
    
    ws8_sendbit LODW pxbuf+9, remove_old 1, ORG$+4; remove_old 1..5
    CONTEXT_RESTORE wsbit_idler4
	IORWF pxbuf+2, F;
	IORWF pxbuf+3, F;
	IORWF pxbuf+4, F;
	IORWF pxbuf+5, F;
    CONTEXT_RESTORE wsbit_after

    ws8_sendbit LODW pxbuf+10, remove_old 6, ORG$+4; remove_old 6..10
    CONTEXT_RESTORE wsbit_idler4
	IORWF pxbuf+7, F;
	IORWF pxbuf+8, F;
	IORWF pxbuf+9, F;
	IORWF pxbuf+10, F;
    CONTEXT_RESTORE wsbit_after

    ws8_sendbit LODW pxbuf+11, remove_old 11, insert_new 0; 0..1
    ws8_sendbit LODW pxbuf+12, remove_old 12, insert_new 2; 2..3
    ws8_sendbit LODW pxbuf+13, remove_old 13, insert_new 4; 4..5
    ws8_sendbit LODW pxbuf+14, remove_old 14, insert_new 6; 6..7
    ws8_sendbit LODW pxbuf+15, remove_old 15, insert_new 8; 8..9
    ws8_sendbit LODW pxbuf+16, remove_old 16, insert_new 10; 10..11
    ws8_sendbit LODW pxbuf+17, remove_old 17, insert_new 12; 12..13
    ws8_sendbit LODW pxbuf+18, remove_old 18, insert_new 14; 14..15
    ws8_sendbit LODW pxbuf+19, remove_old 19, insert_new 16; 16..17
    ws8_sendbit LODW pxbuf+20, remove_old 20, insert_new 18; 18..19
    ws8_sendbit LODW pxbuf+21, remove_old 21, insert_new 20; 20..21
    ws8_sendbit LODW pxbuf+22, remove_old 22, insert_new 22; 22..23
;update last bit and xfr back to caller:
;    ws8_sendbit load_bit 23, remove_old 23, insert_new 23; leaves 2 instr for return to caller
;    ws8_sendbit load_bit 23+100, ORG$, upd_count ws8_send_next_using_#v(pxbuf)_nop1; if !eof loop to next node
    ws8_sendbit LODW engine_last_bit, ORG$, ORG$+4; send saved last bit
    CONTEXT_RESTORE wsbit_idler4
	PAGECHK ws8_send_next_using_#v(pxbuf)_nop1; do this before decfsz
	DECFSZ REGHI(engine_count), F; //REGLO(count), F; //WREG, F
;        setbit BITPARENT(HAS_WSDATA), FALSE; not eof
	GOTO ws8_send_next_using_#v(pxbuf)_nop1; if !eof loop to next node; CAUTION: needs extra NOP
	return;
    CONTEXT_RESTORE wsbit_after
;        setbit BITPARENT(HAS_WSDATA), FALSE; not eof
;    return;
;second-to-last bit xfr back to caller:
;    ws8_sendbit MOVIW +22[FSR_send], prefetch_lastbit, wrong-return; //leaves 2 instr for next call/goto
;last bit must be inlined in caller for loop control:
;    ws8_sendbit (WREG preloaded), predec_count, (loop ctl); //inlined by caller
;additional function to upd pxbuf only (pre-send):
update_only_#v(pxbuf): DROP_CONTEXT;
;    mov8 engine_mask_apply, portmask; which bits to replace
;    mov24 engine_rgb, newrgb;
;    REPEAT LITERAL(24), remove_old pxbuf + REPEATER;
    MOVF engine_mask_apply, W; which bits to replace
    REPEAT LITERAL(24), BANKSAFE dest_arg(F) IORWF pxbuf + REPEATER;, F;
    REPEAT LITERAL(24/2), insert_new 2 * REPEATER;
    return;
    endm
;generate code from template for each pxbuf:
;    rgb_channel_update FSR_even, pxbuf_odd
;    rgb_channel_update FSR_odd, pxbuf_even


    messg [TODO] vv use LDI for sendpx args (set FSR to TOS during prev call?) - would save ~24wd/call, allow mult (masked) rgb upd to alt pxbuf @__LINE__
;    call ws8_sendpx_#v(pxbuf)
;    DW 12-bit count, 2x12-bit newrgb, 8-bit mask or 2x8 count, 3x8 rgb, 1x8 mask

; messg here1 @__LINE__
;send 1 or more WS pixels:
;sets up control vars and then calls rendering engine
;2 instr from previous call are reserved for glue so calls can be chained without WS data interruption
;NOTE: 0-len send only valid at start (useful for scrolling)
;once xmit started, len must be > 0 else WS data stream will stall and pixels will latch
ws8_sendpx macro pxbuf, count, newrgb, portmask; portmask, newrgb, count; 0, prep1, prep2, prep3, prep4, prep5, prep6, prep7, prep8, prep9, prep10, prep11, prep12, prep13, prep14, prep15, prep16, prep17, prep18, prep19, prep20, prep21, prep22, prep23
;    ifbit BITPARENT(HAS_WSDATA), FALSE, GOTO prep_only; _#v(NUM_SENDPX); CAUTION: true case (fall-thru) must be == 2 instr
;    messg #v(BANK_TRACKER), #v(BANKOF(BANK_TRACKER)), #v(BANKOF(LATA)) @__LINE__
;    messg #v(ISBANKED(LATA)), #v(ISBANKED(BANK_TRACKER)), #v(BANKOF(LATA) != BANKOF(BANK_TRACKER)) @__LINE__
;    messg #v(NEEDS_BANKSEL(LATA, BANK_TRACKER)) @__LINE__
    ERRIF(NEEDS_BANKSEL(LATA, BANK_TRACKER), [ERROR] banksel LATA before calling (needs to be < first call) @__LINE__)
    ERRIF(NEEDS_BANKSEL(pxbuf, LATA), [ERROR] pxbuf needs to be !banked or in LATA bank #v(BANKOF(LATA)) @__LINE__)
;custom glue (4 instr): point FSR to control block and check/set BSR to LATA:
;    LOCAL here1 = $
;    mov16 FSR_send, LITERAL(pxbuf); 3-4 instr
;    BANKCHK LATA; paranoid; check for safety
;    ERROF($ > here1+4, [ERROR] either banksel LATA before calling or put pxbuf in bank 0 @__LINE__); too much glue
;    nopif $ < here1+4, here1+4 - $
;PXBUF = pxbuf;
;kludge: copy params while sending WS data:
;inline as few bits as possible while saving params
;    ws8_sendbit MOVIW +0[FSR_send], save_rgb newrgb, save_rgb newrgb
    LOCAL mask_banksel = !ISLIT(portmask) && NEEDS_BANKSEL(portmask, LATA);
    LOCAL rgb_banksel = !ISLIT(newrgb) && NEEDS_BANKSEL(newrgb, LATA);
    LOCAL count_banksel = !ISLIT(count) && NEEDS_BANKSEL(count, LATA);
;    ERRIF(mask_banksel || rgb_banksel || count_banksel, [TODO] banksel in sendpx setup @__LINE__);
    WARNIF(mask_banksel, [ERROR] portmask needs to be !banked or in LATA bank #v(BANKOF(LATA)) @__LINE__)
    WARNIF(rgb_banksel, [ERROR] newrgb needs to be !banked or in LATA bank #v(BANKOF(LATA)) @__LINE__)
    WARNIF(count_banksel, [ERROR] count needs to be !banked or in LATA bank #v(BANKOF(LATA)) @__LINE__)
;    BANKCHK LATA;
;TODO? if !mask don't need to save newrgb
    ws8_sendbit LODW pxbuf+0, ORG$+2, ORG$+4;
    CONTEXT_RESTORE wsbit_idler2
        mov8 engine_mask, portmask; 1-2(4) instr
	idler_pad 2
    CONTEXT_RESTORE wsbit_idler4
	mov16 engine_count, count; 2-4(6) instr
	idler_pad 4
    CONTEXT_RESTORE wsbit_after
    
    ws8_sendbit LODW pxbuf+1, ORG$+2, ORG$+4;
    CONTEXT_RESTORE wsbit_idler2
	mov8 engine_rgb+0, BYTEOF(newrgb, 2); 1-2(4) instr; CAUTION: LE-> BE: hi newrgb -> eng rgb[0]
	idler_pad 2
    CONTEXT_RESTORE wsbit_idler4
	mov8 engine_rgb+1, BYTEOF(newrgb, 1); 2-4(6) instr
	mov8 engine_rgb+2, BYTEOF(newrgb, 0); CAUTION: LE-> BE: lo newrgb -> eng rgb[2]
	idler_pad 4
    CONTEXT_RESTORE wsbit_after

;    ws8_sendbit load_bit 1, ORG$+2, ORG$+4;
;    LOCAL wsbit_idlers
    ws8_sendbit LODW pxbuf+2, ORG$, NOPNZ 1;
	INCF REGHI(engine_count), F; kludge: bump so that decfsz exits loop on time
        CALL ws8_send#v(21)bits_using_#v(pxbuf);
BANK_TRACKER = LATA; ws8_send is supposed to preserve BSR; assume it does; TODO: add call/return tracking
;	if !count_banksel
;	    if !mask_banksel
;	        ws8_sendbit load_bit 1, save_mask portmask, save_count count;
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);

;    if !rgb_banksel
;        ws8_sendbit load_bit 0, save_rgb newrgb, save_rgb newrgb
;	if !count_banksel
;	    if !mask_banksel
;	        ws8_sendbit load_bit 1, save_mask portmask, save_count count;
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;		NOP 2;
;	    else; mask banksel
;	        ws8_sendbit load_bit 1, save_count count, save_mask portmask;
;		ws8_sendbit load_bit 2, save_count count, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;		NOP 2;
;	    endif
;	else; count banksel
;	    if !mask_banksel
;	        ws8_sendbit load_bit 0, save_mask portmask, load_fsr#v(1) LITERAL(count);
;		ws8_sendbit load_bit 0, ORG$, save_count INDF1_postinc
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;		NOP 2;
;	    else; mask banksel
;	        ws8_sendbit load_bit 0, ORG$, load_fsr#v(1) LITERAL(count);
;		ws8_sendbit load_bit 0, ORG$, save_count INDF1_postinc
;		ws8_sendbit load_bit 0, ORG$, save_mask portmask;
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;		NOP 2;
;	    endif
;	endif
;    else; banksel needed for newrgb
;	if !mask_banksel
;            ws8_sendbit load_bit 0, save_mask portmask, load_fsr#v(1) LITERAL(newrgb);
;	    ws8_sendbit load_bit 0, save_rgb INDF1_postinc, save_rgb INDF1_postinc
;	    if !count_banksel
;		ws8_sendbit load_bit 0, ORG$, save_count count
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;	    else
;	        ws8_sendbit load_bit 0, ORG$, load_fsr#v(1) LITERAL(count);
;		ws8_sendbit load_bit 0, ORG$, save_count INDF1_postinc
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;	    endif
;	else; mask banksel
;	    if !count_banksel
;		ws8_sendbit load_bit 0, save_count count, load_fsr#v(1) LITERAL(newrgb);
;		ws8_sendbit load_bit 0, save_rgb INDF1_postinc, save_rgb INDF1_postinc
;		ws8_sendbit load_bit 0, save_count count, save_mask portmask
;		ws8_sendbit load_bit 2, ORG$, CALL ws8_send#v(21)bits_using_#v(pxbuf);
;	    else; count banksel
;	        ws8_sendbit load_bit 0, ORG$, load_fsr#v(1) LITERAL(count);
;
;		ws8_sendbit load_bit 0, ORG$, load_fsr#v(1) LITERAL(newrgb);
;		ws8_sendbit load_bit 0, save_rgb INDF1_postinc, save_rgb INDF1_postinc
;		ws8_sendbit load_bit 0, ORG$, save_mask portmask
;	    endif
;	endif
;    endif
;    ws8_sendbit load_bit 2, CALL ws8_send#v(22)half_bits_using_#v(pxbuf), ORG$; WRONG
    endm
 

;allow 0 count:
;CAUTION: only works before send
ws8_firstpx macro pxbuf, count, newrgb, portmask
    LOCAL start_send, no_send;
    if !ISLIT(count); run-time check; NOTE: affects timing, can't be used > send started
        MOVF REGLO(count), W
	IORWF REGHI(count), W
        ifbit EQUALS0 FALSE, GOTO start_send; upd will be done during (after) send
    else
        if count != LITERAL(0); special case: update rgb only; NOTE: can only be used < send
	    ws8_sendpx pxbuf, count, newrgb, portmask
	    exitm
	endif
    endif
;NOTE: timing doesn't matter here if send has not started
    mov8 engine_mask_apply, portmask; which bits to replace
;    mov24 engine_rgb, newrgb;
	mov8 engine_rgb+0, BYTEOF(newrgb, 2); 1-2(4) instr; CAUTION: LE-> BE: hi newrgb -> eng rgb[0]
	mov8 engine_rgb+1, BYTEOF(newrgb, 1); 2-4(6) instr
	mov8 engine_rgb+2, BYTEOF(newrgb, 0); CAUTION: LE-> BE: lo newrgb -> eng rgb[2]
    CALL update_only_#v(pxbuf);
    BANKCHK LATA; in case ws8_sendpx follows
    if count == LITERAL(0)
	exitm
    endif
    goto no_send; can be another 0-len send
start_send:
    BANKCHK LATA; in case len check changed BSR
    ws8_sendpx pxbuf, count, newrgb, portmask
no_send:
    endm


;pxbuf load-immediate:
    LDI #v(3*8); code expansion; TODO: why is #v() needed here?  mpasm gets confused without it
PBLI macro pxbuf
    mov16 FSR0, LITERAL(pxbuf); destination
    CALL LDI_#v(3*8);
    endm


    constant OFF = LITERAL(0);
    constant RED = LITERAL(0x030000);
    constant GREEN = LITERAL(0x000300);
    constant BLUE = LITERAL(0x000003);
    constant YELLOW = LITERAL(0x020200);
    constant CYAN = LITERAL(0x000202);
    constant MAGENTA = LITERAL(0x020002);
    constant WHITE = LITERAL(0x010101);

#if 1
    constant RED_FULL = LITERAL(0xFF0000);
    constant GREEN_FULL = LITERAL(0x00FF00);
    constant BLUE_FULL = LITERAL(0x0000FF);
    constant YELLOW_HALF = LITERAL(0x7F7F00);
    constant CYAN_HALF = LITERAL(0x007F7F);
    constant MAGENTA_HALF = LITERAL(0x7F007F);
    constant WHITE_THIRD = LITERAL(0x555555);
    constant GOLD_FULL = #v(LITERAL(0xffbf00));
#else
    constant RED_FULL = RED;
    constant GREEN_FULL = GREEN;
    constant BLUE_FULL = BLUE;
    constant YELLOW_HALF = YELLOW;
    constant CYAN_HALF = CYAN;
    constant MAGENTA_HALF = MAGENTA;
    constant WHITE_THIRD = WHITE;
#endif


    b0DCL pxbuf, :24; //8 parallel 24-bit values (1 for each IO pin)
    display_engine pxbuf;
;    b0DCL altbuf, :24; //alternate pxbuf
;    display_engine altbuf;
    doing_init TRUE
    PBLI pxbuf; set initial colors
    DW 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0;
;    PBLI altbuf; set initial colors
;    DW 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa;
    doing_init FALSE


    constant devpanel_mask = LITERAL(0x80);
    constant CHALL = LITERAL(0xFF);
    b0DCL tree_mask,; b1DCL: TODO
    doing_init TRUE
    mov8 tree_mask, LITERAL(0x18);
    doing_init FALSE
#if 0
const pxbuf =
[
    0x111111,
    0x222222,
    0x333333,
    0x444444,
    0x555555,
    0x666666,
    0x777777,
    0x888888,
];
console.log(pivot32x8(pxbuf).map(row => hex(row)).join(", "), srcline());
function pivot32x8(buf32x8)
{
    const retval = [];
    for (let bit = u32(0x80000000), count = 0; bit; bit >>>= 1, ++count)
        retval.push(buf32x8.reduce((colval, rowval, y) => colval | ((rowval & bit)? 1 << (8-1 - y): 0), 0));
    return retval;
}
#endif
;pxbuf_init:
;    DW 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0;
;altbuf_init:
;    DW 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa;
;    DW 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa;
;    DW 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa;


    b0DCL16 ofs;
    b0DCL16 rem;
    doing_init TRUE; CAUTION: must be outside thread def
    messg [TODO] doing_init += jump over @__LINE__
;#define DECFSZ16_BUMP  0x100; kludge: allow 1 extra dec on high byte
#undefine UNIV_LEN
#define UNIV_LEN  15; 240
    mov16 rem, LITERAL(UNIV_LEN - 1); + DECFSZ16_BUMP);
    doing_init FALSE

    THREAD_DEF ws_player, 4
ws_player: DROP_CONTEXT;
    messg [TODO] vvvv add wait intv to context @__LINE__
    WAIT 1 sec; give power time to settle, and set up timer0 outside player loop
;    mov8 tree_mask, LITERAL(0x18);
;    mov24 altbuf+0*3, LITERAL(0x11111111);
;    mov24 altbuf+1*3, LITERAL(0x22222222);
;    mov24 altbuf+2*3, LITERAL(0x33333333);
;    mov24 altbuf+3*3, LITERAL(0x44444444);
;    mov24 altbuf+4*3, LITERAL(0x55555555);
;    mov24 altbuf+5*3, LITERAL(0x66666666);
;    mov24 altbuf+6*3, LITERAL(0x77777777);
;    mov24 altbuf+7*3, LITERAL(0x88888888);
;    memset(pxbuf, 0, LITERAL(24));
;    memcpy(pxbuf, 0x8000 | pxbuf_init, LITERAL(24));
;    memcpy(altuf, 0x8000 | altbuf_init, LITERAL(24));
;    PBLI pxbuf; set initial colors
;    DW 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0;
;    PBLI altbuf; set initial colors
;    DW 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa, 0x01, 0x1e, 0x66, 0xaa;
;    PBLI pxbuf; set initial colors
;    constant O = 0, I = 255;
;    DW O,O,O,O,O,O,I,I, O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O; //red
    ws8_firstpx pxbuf, LITERAL(0), RED_FULL, CHALL;
play_loop: DROP_CONTEXT
#if 0; angel texture
    ws8_firstpx pxbuf, LITERAL(1), RED_FULL, CHALL; 1 off
    ws8_sendpx pxbuf, LITERAL(1), RED_FULL, CHALL; 1 off
    GOTO play_loop;
    WAIT 1 sec/5;
#endif

#if 1; wisemen hard-code loop
    messg wisemen @__LINE__
#undefine UNIV_LEN
#define UNIV_LEN  400
#define BODY_LEN  #v(LITERAL(12 * 20))
#define HEAD_LEN  #v(LITERAL(18 * 4 - 6 * 2))
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
;;fall-thru to fence    GOTO play_loop;
#endif

#if 1; fence + pole
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
;    endm
    
;pole_loop: DROP_CONTEXT;
;    fence 0
;    fence 1
;    fence 2
;    fence 3
;no worky???
;    INCF REGLO(marque), F;
;    MOVLW 3;
;    ANDWF REGLO(marque), F; 0..3
;    MOVLW 7;
;    ADDWF REGLO(marque), F; 7..10
;    GOTO pole_loop;
#endif

#if 0; pole-frame test
    ws8_firstpx pxbuf, LITERAL(0), RED_FULL, CHALL; 1 red
    CALL pole1;
    ws8_firstpx pxbuf, LITERAL(0), GREEN_FULL, CHALL; 1 red
    CALL pole2;
    ws8_firstpx pxbuf, LITERAL(0), WHITE_THIRD, CHALL; 1 red
    CALL pole3;
    ws8_firstpx pxbuf, LITERAL(0), OFF, CHALL; 1 red
    CALL pole4;
    CALL pole5;
    GOTO play_loop;
    
pole1: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FULL, CHALL; 1 red
pole2: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), WHITE_THIRD, CHALL; 1 green
pole3: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 white
pole4: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 off
pole5: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), RED_FULL, CHALL; 1 off
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FULL, CHALL; 1 red
    ws8_sendpx pxbuf, LITERAL(1), WHITE_THIRD, CHALL; 1 green
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 white
    ws8_sendpx pxbuf, LITERAL(2), RED_FULL, CHALL; 1 off
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FULL, CHALL; 1 red
    ws8_sendpx pxbuf, LITERAL(1), WHITE_THIRD, CHALL; 1 green
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 white
    ws8_sendpx pxbuf, LITERAL(2), RED_FULL, CHALL; 1 off
    ws8_sendpx pxbuf, LITERAL(1), GREEN_FULL, CHALL; 1 red
    ws8_sendpx pxbuf, LITERAL(1), WHITE_THIRD, CHALL; 1 green
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 white
    ws8_sendpx pxbuf, LITERAL(2), RED_FULL, CHALL; 1 off
    WAIT 1 sec/5;
    return;
#endif

#if 0; frame test
    CALL frame1;
    CALL frame2;
    CALL frame3;
    GOTO play_loop;
    
frame1: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), GREEN_FULL, CHALL; all red
    WAIT 1 sec;/10;
    return;

frame2: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), BLUE_FULL, CHALL; all green
    WAIT 1 sec;/10;
    return;

frame3: DROP_CONTEXT;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), RED_FULL, CHALL; all blue
    WAIT 1 sec;/10;
    return;
#endif

#if 0; r/g/b fill test
#undefine UNIV_LEN
#define UNIV_LEN  1600
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), GREEN_FULL, CHALL; all red
    WAIT 1 sec;/10;
    
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), BLUE_FULL, CHALL; all green
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), YELLOW_HALF, CHALL; all green
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), MAGENTA_HALF, CHALL; all green
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), CYAN_HALF, CHALL; all green
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), WHITE_THIRD, CHALL; all green
    WAIT 1 sec;/10;

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), RED_FULL, CHALL; all blue
    WAIT 1 sec;/10;
    GOTO play_loop;
#endif

#if 0; ALMOST: rapid zz test
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN), BLUE, CHALL;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; //overshoot detector
    WAIT 1 sec;/10;

loop_fw: DROP_CONTEXT;
;    constant rem = LITERAL(UNIV_LEN); kludge: okay to send past eopx, but send takes longer
;    sub16 rem, LITERAL(UNIV_LEN), ofs;
    mov8 REGHI(rem), LITERAL((UNIV_LEN - 1) >> 8); no SUBLWB so use SUBWFB with reg :(
    MOVF REGLO(rem), W
    SUBLW (UNIV_LEN - 1) & 0xFF;
    MOVWF REGLO(ofs);
    MOVF REGHI(rem), W
    SUBWFB REGHI(ofs), F;

    BANKCHK LATA;
    ws8_sendpx_first pxbuf, ofs, RED, CHALL; var# off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
    ws8_sendpx pxbuf, rem, OFF, CHALL; remaining off
    WAIT 1 sec;/10;

    INCF REGHI(rem), F; kludge: allow 1 extra dec on high byte for DECFSZ
;    inc16 ofs
    DECFSZ REGLO(rem), F
    INCF REGHI(rem), F
    DECFSZ REGHI(rem), F
    GOTO loop_fw;
    
loop_bk: DROP_CONTEXT;
    mov8 REGHI(ofs), LITERAL((UNIV_LEN - 1) >> 8); no SUBLWB so use SUBWFB with reg :(
    MOVF REGLO(ofs), W
    SUBLW (UNIV_LEN - 1) & 0xFF;
    MOVWF REGLO(rem);
    MOVF REGHI(ofs), W
    SUBWFB REGHI(rem), F;

    BANKCHK LATA;
    ws8_sendpx_first pxbuf, ofs, GREEN, CHALL; var# off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
    ws8_sendpx pxbuf, rem, OFF, CHALL; remaining off
    WAIT 1 sec;/10;

    INCF REGHI(ofs), F; kludge: allow 1 extra dec on high byte for DECFSZ
;    inc16 ofs
    DECFSZ REGLO(ofs), F
    INCF REGHI(ofs), F
    DECFSZ REGHI(ofs), F
    GOTO loop_bk;
#endif

#if 0; working: slow 1px color test
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
    ws8_sendpx pxbuf, LITERAL(5), OFF, CHALL; 2 rows off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), GREEN, CHALL; 1 row off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 green
    ws8_sendpx pxbuf, LITERAL(4), OFF, CHALL; 1 row off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(2), BLUE, CHALL; 2 rowsoff
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 blue
    ws8_sendpx pxbuf, LITERAL(3), OFF, CHALL; 1 row off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(3), YELLOW, CHALL; 2 rowsoff
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 blue
    ws8_sendpx pxbuf, LITERAL(2), OFF, CHALL; 1 row off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(4), MAGENTA, CHALL; 2 rowsoff
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 blue
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 row off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(5), CYAN, CHALL; 2 rowsoff
    ws8_sendpx pxbuf, LITERAL(1), RED, CHALL; 1 blue
    WAIT 1 sec
#endif

#if 0
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(16+1), RED, CHALL; 16 off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
    ws8_sendpx pxbuf, LITERAL(5), OFF, CHALL; 5 off
    WAIT 1 sec
    
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(17), RED, CHALL; 16 off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
;    ws8_sendpx pxbuf, LITERAL(4), OFF, CHALL; 5 off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(18), RED, CHALL; 16 off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
;    ws8_sendpx pxbuf, LITERAL(3), OFF, CHALL; 5 off
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(19), RED, CHALL; 16 off
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 red
;    ws8_sendpx pxbuf, LITERAL(4), OFF, CHALL; 5 off
    WAIT 1 sec
#endif

#if 0; wrong
pin_finder:
    BANKCHK LATA;
;legend:
;    nbDCL looper,;
;    mov8 looper, LITERAL(3)
    ws8_sendpx pxbuf, LITERAL(2), RED, CHALL; 2 off
    ws8_sendpx pxbuf, LITERAL(1), GREEN, CHALL; 1 "red"
    ws8_sendpx pxbuf, LITERAL(1), BLUE, CHALL; 1 "green"
    ws8_sendpx pxbuf, LITERAL(1), WHITE, CHALL; 1 blue
    ws8_sendpx pxbuf, LITERAL(1), OFF, CHALL; 1 white
    ws8_sendpx pxbuf, LITERAL(2), RED, CHALL; 2 off
;modified pattern:
;ra0 .      .
;ra1 ..     ..
;ra2 ...    ...
;ra3 ....   ....
;ra4 .....  .....
;ra5 ...... ......
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(1); 1 red, all ports
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(2); 1 red, ports RA1-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(4); 1 red, ports RA2-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(8); 1 red, ports RA3-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(16); 1 red, ports RA4-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(32); 1 red, RA5
    ws8_sendpx pxbuf, LITERAL(1), RED, CHALL; 1 off, all

    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(1); 1 red, all ports
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(2); 1 red, ports RA1-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(4); 1 red, ports RA2-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(8); 1 red, ports RA3-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(16); 1 red, ports RA4-RA5
    ws8_sendpx pxbuf, LITERAL(1), OFF, LITERAL(32); 1 red, RA5
    WAIT 1 sec

    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(2), RED, CHALL; 2 off
    ws8_sendpx pxbuf, LITERAL(2), OFF, CHALL; 2 red
    ws8_sendpx pxbuf, LITERAL(2), GREEN, CHALL; 2 off
    ws8_sendpx pxbuf, LITERAL(2), OFF, CHALL; 2 green
    ws8_sendpx pxbuf, LITERAL(2), BLUE, CHALL; 2 off
    ws8_sendpx pxbuf, LITERAL(2), OFF, CHALL; 2 blue
    WAIT 1 sec
    
;    sleep
#endif

#if 0
;    MOVLW RED_PALINX;
;    messg #v(BANK_TRACKER), #v(BANKOF(BANK_TRACKER)), #v(BANKOF(LATA)) @__LINE__
;    messg #v(ISBANKED(LATA)), #v(ISBANKED(BANK_TRACKER)), #v(BANKOF(LATA) != BANKOF(BANK_TRACKER)) @__LINE__
;    messg #v(NEEDS_BANKSEL(LATA, BANK_TRACKER)) @__LINE__
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), LITERAL(0x020000), devpanel_mask
    ws8_sendpx pxbuf, LITERAL(1), LITERAL(0x010100), devpanel_mask
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN-2), LITERAL(0x010001), devpanel_mask
;    CALL ws8_flushpx
    WAIT 1 sec
;    MOVLW GREEN_PALINX;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(1), LITERAL(0x000200), LITERAL(-1 & 0xFF)
    ws8_sendpx pxbuf, LITERAL(1), LITERAL(0x000101), tree_mask
    ws8_sendpx altbuf, LITERAL(2), LITERAL(0x010100), devpanel_mask
    ws8_sendpx altbuf, LITERAL(UNIV_LEN-2), LITERAL(0x999999), LITERAL(0)
;    CALL ws8_flushpx
    WAIT 1 sec
;    MOVLW BLUE_PALINX;
    BANKCHK LATA;
    ws8_sendpx pxbuf, , LITERAL(1), LITERAL(0x000002), LITERAL(-1 & 0xFF);
    ws8_sendpx pxbuf, LITERAL(1), LITERAL(0x010001), LITERAL(-1 & 0xFF);
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN-2), LITERAL(0x010001), LITERAL(-1 & 0xFF);
;    CALL ws8_flushpx
    WAIT 1 sec
;    MOVLW OFF_PALINX;
    BANKCHK LATA;
    ws8_sendpx pxbuf, LITERAL(UNIV_LEN-1), LITERAL(0), LITERAL(-1 & 0xFF); //-1 for test (leave last px visible)
;    CALL ws8_flushpx; ws8_sendpx -1, 0, LITERAL(0); flush
    WAIT 1 sec
#endif
    GOTO play_loop
    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @216
;#else; too deep :(
#endif
#if HOIST == 4444+1; //GOOD hack: 8-bit parallel wsplayer
    messg hoist 4: HACK: 8-bit parallel wsplayer @89
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; 8-bit parallel wsplayer ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#define PXOUT  RA0
#define UNIV_LEN  1600; //33; //10; //<= 2x banked GPRAM (for in-memory bitmaps), else prog space
;#define RGB_ORDER  213; //0x213; //GRB (normal is 0x123 = RGB)
#define WS_ENV  235; // 2/3/5 @ 8MIPS completely meets WS2811 + WS2812 specs
;//#define WS_ENV  334; //make start pulse longer

#ifdef LEDOUT
 #undefine LEDOUT
#endif
#define LEDOUT  RA4

;send 1 WS data bit to each IO pin:
;bits are assumed to be in WREG
;2/3/5 env @8 MIPS uses 30% CPU time (3 instr), leaves 70% for caller (7 instr)
;last 4 instr of env time (idle) are typically used for call/return or loop control
;earlier 1-3 instr of idle env time are typically used for data prep
;rendering typically must be done between outside WS env (while waiting on timer for next frame) - there's not enough time during WS env except for the most trivial rendering
;    doing_init TRUE
;not needed: IO pin init does this
;    mov8 LATA, LITERAL(0); //start with WS data lines low; NOTE: this is required for correct send startup
;    doing_init FALSE
;ws8_sendbit_wreg macro glue_reserved
;    ws8_sendbit ORG$, ORG$, NOP #v(4 - ABS(glue_reserved))
;    endm
ws8_sendbit macro idler1, idler2, idler4
    ERRIF((WS_ENV != 235) || (FOSC_FREQ != 8 MIPS), [ERROR] WS envelope WS_ENV !implemented @ fosc FOSC_FREQ - use 235 @8MIPS @__LINE__)
    COMF LATA, F; //bit start; CAUTION: LATA must be 0 prior (which it should be)
;    ORG $+1; placeholder
    LOCAL here1 = $
    idler1
    nopif $ == here1, 1
    MOVWF LATA; //bit data
;    ORG $+2; placeholder
    LOCAL here2 = $
    idler2
    nopif $ == here2, 2
    CLRF LATA; //bit end
;    ORG $+4; placeholder
    LOCAL here3 = $
    idler4
    nopif $ == here3, 4
    endm


;//send var bit, byte, or pixel:
;//FSR0 or 1 points to parallel pixel data
;//by convention, FSR0 is bg color, FSR1 is fg color
;//NOTE: FSR changes after each call (auto-inc)
    CONSTANT BG = 0, FG = 1
    BANKCHK LATA; caller must set BSR; makes timing uniform in here
ws8_sendFGbyte:
ws8_sendFGbit_#v(8): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(7): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(6): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(5): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(4): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(3): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(2): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_sendFGbit_#v(1): ws8_sendbit MOVIW INDF1++, ORG$, return; //return + next call takes 4 instr
ws8_sendBGbyte:
ws8_sendBGbit_#v(8): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(7): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(6): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(5): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(4): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(3): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(2): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_sendBGbit_#v(1): ws8_sendbit MOVIW INDF0++, ORG$, return; //return + next call takes 4 instr
;lamba wrapper for ws_sendbit:
;uses NOP 2 timeslot
rewindpx macro fgbg
    addfsr FSR#v(fgbg), -24+1; first bit was already sent, only need 23 more
    NOP 1
    endm
ws8_resendFGpx:
    ws8_sendbit MOVIW -24[FSR#v(FG)], rewindpx FG, goto ws8_sendFG_23bits; //goto+call = 4 instr
ws8_sendFGpx:
    ws8_sendbit MOVIW INDF#v(FG)++, ORG$, NOP 2; //reserve 2 instr for next call
ws8_sendFG_23bits:
    call ws8_sendFGbit_#v(8-1); //custom bit above
    call ws8_sendFGbit_#v(8);
    call ws8_sendFGbit_#v(8-1); //custom bit below
    NOP 2; //replaces "call" (next bit is inlined)
    ws8_sendbit MOVIW INDF#v(FG)++, ORG$, return; //return + next call takes 4 instr
ws8_resendBGpx:
    ws8_sendbit MOVIW -24[FSR#v(BG)], rewindpx BG, goto ws8_sendBG_23bits; //goto+call = 4 instr
ws8_sendBGpx:
    ws8_sendbit MOVIW INDF#v(BG)++, ORG$, NOP 2; //reserve 2 instr for next call
ws8_sendBG_23bits:
    call ws8_sendBGbit_#v(8-1); //custom bit above
    call ws8_sendBGbit_#v(8);
    call ws8_sendBGbit_#v(8-1); //custom bit below
    NOP 2; //replaces "call" (next bit is inlined)
    ws8_sendbit MOVIW INDF#v(BG)++, ORG$, return; //return + next call takes 4 instr


    nbDCL count,;
    constant UNIV_SCALE = divup(UNIV_LEN, 256); //8; //octal nodes to scale UNIV_LEN down to 8 bits
    constant SEND_COUNT = divup(UNIV_LEN, UNIV_SCALE);
;    messg [INFO] univ len #v(UNIV_LEN), sends #v(SEND_COUNT * UNIV_SCALE) nodes with granularity #v(UNIV_SCALE) nodes @__LINE__
    WARNIF(SEND_COUNT * UNIV_SCALE != UNIV_LEN, [WARNING] univ len #v(UNIV_LEN) rounds to #v(SEND_COUNT * UNIV_SCALE) during send  @__LINE__)
;TODO: fix ^^^ by adding 1x send after loop
ws_fillbg: DROP_CONTEXT;
    mov8 count, LITERAL(SEND_COUNT); //divup(UNIV_LEN / UNIV_SCALE)); //scale to fit in 8-bit counter
;    addfsr FSR#v(BG), 24; //compensate for first rewind
    mov16 FSR#v(BG), LITERAL(bgcolor + 24); //point to END of palette entry (compensate for resend)
    BANKCHK LATA; //pre-select BSR to simplify timing
fill_loop: ;CAUTION: do not yield within this loop - will interfere with timing
    if UNIV_SCALE > 0
        REPEAT LITERAL(UNIV_SCALE - 1), call ws8_resendBGpx
	NOP 2; //replaces "call" (next bit is inlined)
    endif
;rewindpx with custom last bit:
    ws8_sendbit MOVIW -24[FSR#v(BG)], rewindpx BG, call ws8_sendBGbit_#v(8-1); //call+call = 4 instr
    call ws8_sendBGbit_#v(8);
    call ws8_sendBGbit_#v(8-1); //custom bit below
    NOP 2; //replaces "call" (next bit is inlined)
    ws8_sendbit MOVIW INDF#v(BG)++, ORG$, NOP 1; //reserve 3 instr for loop ctl
	PAGECHK fill_loop; do this before decfsz
    DECFSZ count, F; //REGLO(count), F; //WREG, F
    goto fill_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;

;color palette:
;each entry is 24 bytes: colors are 24 bits, and 1 bit from each byte goes to a separate IO pin
;PICs with 256 bytes RAM can only hold 10 palette entries in RAM; palette indexes use <= 4 bits
    b0DCL fgcolor, :24; //8 parallel 24-bit values (1 for each IO pin)
    b0DCL bgcolor, :24; //8 parallel 24-bit values (1 for each IO pin)
    constant I = 255; //all 8 bits on (readbility, src code alignment)
    constant O = 0; //BIT(4); //all 8 bits off (or tampered/excluded)
#if 0
palette8_rom:
;TODO? could compress this but would break PALINX arithmetic
    CONSTANT OFF_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O;
    CONSTANT BLUE_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O, O,O,O,O,O,O,I,O; //dim
;//    DW O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O, I,I,I,I,I,I,I,I; //bright
    CONSTANT GREEN_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,O,O, O,O,O,O,O,O,I,O, O,O,O,O,O,O,O,O; //dim
;//    DW X,X,X,X,X,X,X,X, I,I,I,I,I,I,I,I, O,O,O,O,O,O,O,O; //bright
    CONSTANT CYAN_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,O,O, O,O,O,O,O,O,I,O, O,O,O,O,O,O,I,O; //dim
;//    DW O,O,O,O,O,O,O,O, I,I,I,I,I,I,I,I, I,I,I,I,I,I,I,I; //bright
    CONSTANT RED_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,I,O, O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O; //dim
;//    DW I,I,I,I,I,I,I,I, O,O,O,O,O,O,O,O, O,O,O,O,O,O,O,O; //bright
    CONSTANT MAGENTA_PALINX = ($ - palette8_rom) / 24, PINK_PALINX = MAGENTA_PALINX; easier to spell :P
    DW O,O,O,O,O,O,I,O, O,O,O,O,O,O,O,O, O,O,O,O,O,O,I,O; //dim
;//    DW I,I,I,I,I,I,I,I, O,O,O,O,O,O,O,O, I,I,I,I,I,I,I,I; //bright
    CONSTANT YELLOW_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,I,O, O,O,O,O,O,O,I,O, O,O,O,O,O,O,O,O; //dim
;//    DW I,I,I,I,I,I,I,I, I,I,I,I,I,I,I,I, O,O,O,O,O,O,O,O; //bright
    CONSTANT WHITE_PALINX = ($ - palette8_rom) / 24;
    DW O,O,O,O,O,O,I,O, O,O,O,O,O,O,I,O, O,O,O,O,O,O,I,O; //dim
;//    DW I,I,I,I,I,I,I,I, I,I,I,I,I,I,I,I, I,I,I,I,I,I,I,I; //bright
    CONSTANT TEST_PALINX = ($ - palette8_rom) / 24; //TEST ONLY; put after END_PALINX?
    DW 0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01, 0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x8, 0xE7,0xD9,0x9D,0x7E,0x18,0x24,0x42,0x81; //test bit pattern to watch in debugger
;//TODO: add more as needed ...
    CONSTANT END_PALINX = ($ - palette8_rom) / 24;

;RGB color indexes are 3 lsb; controls R/G/B on/off (for easier color combinations/debug)
;//#define BRIGHT(rgb)  ((rgb) + 8); brighter variant
    ERRIF(YELLOW_PALINX != (RED_PALINX | GREEN_PALINX), [ERROR] yellow #v(YELLOW_PALINX) != red #v(RED_PALINX) + green #v(GREEN_PALINX) @__LINE__)
    ERRIF(CYAN_PALINX != (GREEN_PALINX | BLUE_PALINX), [ERROR] cyan #v(CYAN_PALINX) != green #v(GREEN_PALINX) + blue #v(BLUE_PALINX) @__LINE__)
    ERRIF(MAGENTA_PALINX != (RED_PALINX | BLUE_PALINX), [ERROR] magenta #v(MAGENTA_PALINX) != red #v(RED_PALINX) + blue #v(BLUE_PALINX) @__LINE__)
    ERRIF(WHITE_PALINX != (RED_PALINX | GREEN_PALINX | BLUE_PALINX), [ERROR] white #v(WHITE_PALINX) != red #v(RED_PALINX) + green #v(GREEN_PALINX) + blue #v(BLUE_PALINX) @__LINE__)
;//    CONSTANT CUSTOM_PALINX = BRIGHT(0); caller-defined palette entry
;    CONSTANT FB_PALINX = 8
;    CONSTANT BG_PALINX = 9


;with_arg(bgcolor + 0) macro stmt
;    stmt, bgcolor + 0
;    endm
fsrxfr macro
    MOVIW INDF1++
    MOVWI INDF0++
WREG_TRACKER = WREG_UNKN
    endm
memcpy macro dest, src, count
    if dest != FSR0
	mov16 FSR0, dest
    endif
    if src != FSR1
	mov16 FSR1, src
    endif
    REPEAT count, fsrxfr
    endm

;INDF takes 1 extra instr cycle to access ROM
;copy from ROM to RAM to avoid this (simplifies parallel bit banging timing)
;CAUTION: this is EXPENSIVE (memcpy by itself is 72 instr); only use during frame setup when IO is idle
setbg_frompalette: DROP_CONTEXT;
;    ANDLW 0x0F; 4 bpp
    swapf WREG, W
    ANDLW 0xF0; //x16
    MOVWF bgcolor; kludge: use as temp
    mov16 FSR1, LITERAL(0x8000 + palette8_rom); //ROM address: NOTE: adds 1 instr cycle overhead each access
;    lslf bgcolor, W
;    ADDWF bgcolor, W; 3x
;    MOVF bgcolor, W;
    lsrf bgcolor, W; //x8
    addwf bgcolor, W; //x24; CAUTION: assumes <= 10 (no 8-bit wrap)
    ADDWF REGLO(FSR1), F;
    ifbit CARRY TRUE, dest_arg(F) INCF REGHI(FSR1)
;    mov16 FSR#v(BG), LITERAL(bgcolor)
;    REPEAT LITERAL(24), with_arg(bgcolor + REPEATER) MOVIW INDF#v(BG)++
;//TODO: use linear addr? 0x2000  skips gaps, but requires extra MOVLW/BSF to set FSR
    memcpy LITERAL(bgcolor), FSR1, LITERAL(24);
;moved    mov16 FSR#v(BG), LITERAL(bgcolor); //leave FSR pointing to palette entry in RAM; could replace with ADDFSR to save 2 instr
    return;
#endif
;non-ROM version of above:
;lit takes up same/less prog space as above and runs faster (with opp'ty for additional optimization)
;var takes up 50% more prog space but also runs faster
setbg_fromrgb macro rgb
;        REPEAT LITERAL(24), MOVWF bgcolor + REPEATER, LITERAL(0)
    LOCAL bit = 23;
    while bit
        if ISLIT(rgb)
;	    if (rgb) & BIT(bit)
;	        MOVLW 0xFF; //SET8W; set all WREG bits; redundant loads will be optimized out
;		MOVWF bgcolor + bit;
;	    else
;		CLRF bgcolor + bit;
;	    endif
	    mov8 bgcolor + 23 - bit, LITERAL(BOOL2INT((rgb) & BIT(bit)) * 0xFF)
	else
	    CLRF bgcolor + 23 - bit;
	    ifbit rgb + 2 - bit / 8, bit % 8, TRUE, dest_arg(F) DECF bgcolor + 23 - bit; big endian
	endif
bit -= 1;
    endw
    endm


    THREAD_DEF ws_player, 4
ws_player: DROP_CONTEXT;
    WAIT 1 sec; give power time to settle, set up timer1 outside player loop
play_loop: ;DROP_CONTEXT
;    MOVLW RED_PALINX;
;    CALL setbg_frompalette; doing this while idle < wait
    setbg_fromrgb LITERAL(0x020000); dim red
    WAIT 1 sec
    CALL ws_fillbg;
;    setbit LATA, LEDOUT, TRUE;
;    MOVLW GREEN_PALINX;
;    CALL setbg_frompalette; doing this while idle < wait
    setbg_fromrgb LITERAL(0x000200); dim green
    WAIT 1 sec
    CALL ws_fillbg;
;    setbit LATA, LEDOUT, FALSE;
;    MOVLW BLUE_PALINX;
;    CALL setbg_frompalette; doing this while idle < wait
    setbg_fromrgb LITERAL(0x000002); dim blue
    WAIT 1 sec
    CALL ws_fillbg;
;    setbit LATA, LEDOUT, TRUE;
;    MOVLW OFF_PALINX;
;    CALL setbg_frompalette; doing this while idle < wait
    setbg_fromrgb LITERAL(0); off
    WAIT 1 sec
    CALL ws_fillbg;
;    setbit LATA, LEDOUT, FALSE;
    GOTO play_loop
    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @216
;#else; too deep :(
#endif
#if HOIST == 4444-1; //hack: 8-bit parallel wsplayer
    messg hoist 4: HACK: 8-bit parallel wsplayer @89
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; 8-bit parallel wsplayer ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#define PXOUT  RA0
#define UNIV_LEN  1600; //33; //10; //<= 2x banked GPRAM (for in-memory bitmaps), else prog space
#define UNIV_SCALE  8; //octal nodes to scale UNIV_LEN down to 8 bits
;#define RGB_ORDER  213; //0x213; //GRB (normal is 0x123 = RGB)
#define WS_ENV  235; // 2/3/5 @ 8MIPS completely meets WS2811 + WS2812 specs
;//#define WS_ENV  334; //make start pulse longer


;send 1 WS data bit to each IO pin:
;bits are assumed to be in WREG
;2/3/5 env @8 MIPS uses 30% CPU time (3 instr), leaves 70% for caller (7 instr)
    doing_init TRUE
    CLRF LATA, 0; //start with WS data lines low
    doing_init FALSE
ws8_sendbit_wreg macro glue_reserved
    ws8_sendbit ORG$, ORG$, NOP #v(4 - ABS(glue_reserved))
    endm
ws8_sendbit macro idler1, idler2, idler4
    ERRIF(WS_ENV != 235 || FOSC_FREQ != 8 MIPS, [ERROR] WS envelope WS_ENV !implemented @ FOSC_FREQ - use 235 @8 MIPS @__LINE__)
    COMF LATA, F; //bit start; CAUTION: LATA must be 0 prior (which it should be)
;    ORG $+1; placeholder
    LOCAL here1 = $
    idler1
    nopif $ == here1, 1
    MOVWF LATA; //bit data
;    ORG $+2; placeholder
    LOCAL here2 = $
    idler2
    nopif $ == here2, 2
    CLRF LATA; //bit end
;    ORG $+4; placeholder
    LOCAL here3 = $
    idler4
    nopif $ == here3, 4
    endm


;//send colored px to all IO pins:
;//primary colors only
;TODO: custom colors
#define BRIGHTNESS 2; /0xFF
ws8_sendpx_off macro custom_bits
    call ws8_byte_#v(0); //ws8_bitoff_#v(8);
    call ws8_byte_#v(0); //ws8_bitoff_#v(8);
    call ws8_bitoff_#v(8 - ABS(custom_bits));
    endm
ws8_sendpx_red macro custom_bits
    call ws8_byte_#v(BRIGHTNESS);
    call ws8_byte_#v(0);
    call ws8_bitoff_#v(8 - ABS(custom_bits));
    endm
ws8_sendpx_green macro custom_bits
    call ws8_byte_#v(0);
    call ws8_byte_#v(BRIGHTNESS);
    call ws8_bitoff_#v(8 - ABS(custom_bits));
    endm
ws8_sendpx_blue macro custom_bits
    call ws8_byte_#v(0);
    call ws8_byte_#v(0);
#if BRIGHTNESS == 0xFF; //full bright
    call ws8_biton_#v(8 - ABS(custom_bits));
#else; //dim
    call ws8_bitoff_#v(8-MIN(ABS(custom_bits), 2));
    CALLIF ABS(custom_bits) < 2, ws8_biton_#v(1);
    CALLIF ABS(custom_bits) < 1, ws8_bitoff_#v(1);
#endif
    endm

;//send bit or byte:
;TODO: implement other 8-bit values as needed
ws8_byte_#v(0xFF):
ws8_biton_#v(8): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(7): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(6): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(5): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(4): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(3): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(2): ws8_sendbit SET8W, ORG$, ORG$;
ws8_biton_#v(1): ws8_sendbit SET8W, ORG$, return; //return + next call takes 4 instr
ws8_byte_#v(0):
ws8_bitoff_#v(8): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(7): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(6): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(5): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(4): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(3): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(2): ws8_sendbit CLRW, ORG$, ORG$;
ws8_bitoff_#v(1): ws8_sendbit CLRW, ORG$, return; //return + next call takes 4 instr
;variable byte/bits from FSR0:
ws8_bytevar0:
ws8_bitvar0_#v(8): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(7): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(6): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(5): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(4): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(3): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(2): ws8_sendbit MOVIW INDF0++, ORG$, ORG$;
ws8_bitvar0_#v(1): ws8_sendbit MOVIW INDF0++, ORG$, return; //return + next call takes 4 instr
;variable byte/bits from FSR1:
ws8_bytevar1:
ws8_bitvar1_#v(8): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(7): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(6): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(5): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(4): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(3): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(2): ws8_sendbit MOVIW INDF1++, ORG$, ORG$;
ws8_bitvar1_#v(1): ws8_sendbit MOVIW INDF1++, ORG$, return; //return + next call takes 4 instr
;custom dim brightness:
ws8_byte_#v(2):
    ws8_sendbit CLRW, ORG$, NOP 2; reserve 2 instr for next call
    call ws8_bitoff_#v(5); //save some prog space
    NOP 2; use up 2 instr in place of "call"
    ws8_sendbit SET8W, ORG$, ORG$;
    ws8_sendbit CLRW, ORG$, return; //return + next call takes 4 instr


    nbDCL count,;
ws_all_off: DROP_CONTEXT;
    ws_setbyte0 0
    mov8 count LITERAL(UNIV_LEN / UNIV_SCALE); //scale to fit in 8-bit counter
    BANKCHK LATA; //pre-select BSR to simplify timing
off_loop:
    REPEAT LITERAL(UNIV_SCALE), ws_sendpx_off BOOL2INT(REPEATER == UNIV_SCALE - 1)
    ws8_sendbit CLRW, ORG$, NOP 1; //reserve 3 instr for loop ctl
	PAGECHK off_loop; do this before decfsz
    DECFSZ count, F; //REGLO(count), F; //WREG, F
    goto off_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;

ws_all_red: DROP_CONTEXT;
    mov8 count LITERAL(UNIV_LEN / UNIV_SCALE); //scale to fit in 8-bit counter
    BANKCHK LATA; //pre-select BSR to simplify timing
red_loop:
    REPEAT LITERAL(UNIV_SCALE), ws_sendpx_red BOOL2INT(REPEATER == UNIV_SCALE - 1)
    ws8_sendbit CLRW, ORG$, NOP 1; //reserve 3 instr for loop ctl
	PAGECHK red_loop; do this before decfsz
    DECFSZ count, F; //REGLO(count), F; //WREG, F
    goto red_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;

ws_all_green: DROP_CONTEXT;
    mov8 count LITERAL(UNIV_LEN / UNIV_SCALE); //scale to fit in 8-bit counter
    BANKCHK LATA; //pre-select BSR to simplify timing
green_loop:
    REPEAT LITERAL(UNIV_SCALE), ws_sendpx_green BOOL2INT(REPEATER == UNIV_SCALE - 1)
    ws8_sendbit CLRW, ORG$, NOP 1; //reserve 3 instr for loop ctl
	PAGECHK green_loop; do this before decfsz
    DECFSZ count, F; //REGLO(count), F; //WREG, F
    goto green_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;

ws_all_blue: DROP_CONTEXT;
    mov8 count LITERAL(UNIV_LEN / UNIV_SCALE); //scale to fit in 8-bit counter
    BANKCHK LATA; //pre-select BSR to simplify timing
blue_loop:
    REPEAT LITERAL(UNIV_SCALE), ws_sendpx_blue BOOL2INT(REPEATER == UNIV_SCALE - 1)
    ws8_sendbit CLRW, ORG$, NOP 1; //reserve 3 instr for loop ctl
	PAGECHK blue_loop; do this before decfsz
    DECFSZ count, F; //REGLO(count), F; //WREG, F
    goto blue_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;


    THREAD_DEF ws_player, 4
ws_player: DROP_CONTEXT;
    call ws_all_red
    WAIT 1 sec
    call ws_all_green
    WAIT 1 sec
    call ws_all_blue
    WAIT 1 sec
    call ws_all_off
    WAIT 1 sec
    goto ws_player
    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @216
;#else; too deep :(
#endif
#if HOIST == 444-1; //hack: 1-bit wsplayer
    messg hoist 4: HACK: 1-bit wsplayer @89
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; 1-bit wsplayer ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#define PXOUT  RA0
#define UNIV_LEN  1600; //33; //10; //<= 2x banked GPRAM (for in-memory bitmaps), else prog space
#define UNIV_SCALE  8; //octal nodes to scale UNIV_LEN down to 8 bits
;#define RGB_ORDER  213; //0x213; //GRB (normal is 0x123 = RGB)
#define WS_ENV  235; // 2/3/5 @ 8MIPS completely meets WS2811 + WS2812 specs
;//#define WS_ENV  334; //make start pulse longer


#define ON_GLUE  4
wson_more macro glue4
    setbit LATA, PXOUT, TRUE; //bit start+data
    NOP 4
    setbit LATA, PXOUT, FALSE; //bit end
    LOCAL here = $
    glue4
    if $ == here
        NOP ON_GLUE;
    endif
    endm

    BANKCHK LATA
;    REPEAT LITERAL(6), EMITL wson#v(REPEATER + 2): wson_more ORG$
wson_#v(8): wson_more ORG$
wson_#v(7): wson_more ORG$
wson_#v(6): wson_more ORG$
wson_#v(5): wson_more ORG$
wson_#v(4): wson_more ORG$
wson_#v(3): wson_more ORG$
wson_#v(2): wson_more ORG$
wson_#v(1):
    wson_more return; //return + later call == 4 instr


#define OFF_GLUE  7
wsoff_more macro glue7
    setbit LATA, PXOUT, TRUE; //bit start
    NOP 1
    setbit LATA, PXOUT, FALSE; //bit data+end
    LOCAL here = $
    glue7
    if $ == here
;        call nop7;
	NOP OFF_GLUE;
    endif
    endm

    BANKCHK LATA
;    REPEAT LITERAL(6), EMITL wsoff#v(REPEATER + 2): wsoff_more ORG$
wsoff_#v(8): wsoff_more ORG$
wsoff_#v(7): wsoff_more ORG$
wsoff_#v(6): wsoff_more ORG$
wsoff_#v(5): wsoff_more ORG$
wsoff_#v(4): wsoff_more ORG$
wsoff_#v(3): wsoff_more ORG$
wsoff_#v(2): wsoff_more ORG$
wsoff_#v(1):
    wsoff_more NOP OFF_GLUE-4; //EMITL nop7: NOP 3; //call + return == 4 instr
    return; //return + later call == 4 instr

;ws_send_byte macro byte
;    endm

;ws_send_px macro rgb
;    ERRIF(!ISLIT(rgb), [TODO] reg rgb);
;    LOCAL wsbits = UNLIT(rgb), wsbit = 0x800000;
;    while wsbit
;wsbit >>= 1
;    endw
;    endm


send_off_node macro want_last_bit
    call wsoff_#v(8);
    call wsoff_#v(8);
    call wsoff_#v(8 - 1 + BOOL2INT(want_last_bit));
    endm

;    nbDCL16 count,;
ws_all_off:
    BANKCHK LATA;
    MOVLW UNIV_LEN / UNIV_SCALE; //+3; //TODO: why is +1 needed here?
;    mov16 count, LITERAL(UNIV_LEN + 0x100);
;    decf REGHI(count), F;
off_loop_lower: DROP_CONTEXT;
    REPEAT LITERAL(UNIV_SCALE - 1), send_off_node TRUE
;    REPEAT LITERAL((UNIV_SCALE - 1) * 3), call wsoff_#v(8);
;    call wsoff_#v(8);
;    call wsoff_#v(8);
;    call wsoff_#v(8-1); //2 bit slots reserved for loop control
    send_off_node FALSE
    NOP 2; use up "call" time
    wsoff_more NOP OFF_GLUE-3; leave 3 instr for loop
	PAGECHK off_loop_lower; do this before decfsz
    decfsz WREG, F; //REGLO(count), F; //WREG, F
    goto off_loop_lower
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;

send_blue_node macro want_last_bit
    call wsoff_#v(8);
    call wsoff_#v(8);
#if 1
    call wson_#v(8 - 1 + BOOL2INT(want_last_bit));
#else
    call wsoff_#v(8-2);
    call wson_#v(1);
    if want_last_bit
	call wsoff_#v(1);
    endif
#endif
    endm

ws_all_blue: DROP_CONTEXT;
    BANKCHK LATA;
    MOVLW UNIV_LEN / UNIV_SCALE; //+3; //TODO: why is +1 needed here?
blue_loop:
    REPEAT LITERAL(UNIV_SCALE - 1), send_blue_node TRUE
;    call wsoff_#v(8);
;    call wsoff_#v(8);
;;    call wson_#v(7);
;    call wsoff_#v(6);
;    call wson_#v(1);
    send_blue_node FALSE
    NOP 2; use up "call" time
;    wson_more NOP 1; leave 3 instr for loop
    wsoff_more NOP OFF_GLUE-3; leave 3 instr for loop
	PAGECHK blue_loop; do this before decfsz
    decfsz WREG, F
    goto blue_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;

send_green_node macro want_last_bit
    call wsoff_#v(8);
#if 1
    call wson_#v(8);
#else
    call wsoff_#v(8-2);
    call wson_#v(1);
    call wsoff_#v(1);
#endif
    call wsoff_#v(8 - 1 + BOOL2INT(want_last_bit));
    endm

ws_all_green: DROP_CONTEXT;
    BANKCHK LATA;
    MOVLW UNIV_LEN / UNIV_SCALE; //+3; //TODO: why is +1 needed here?
green_loop:
    REPEAT LITERAL(UNIV_SCALE - 1), send_green_node TRUE
;    call wsoff_#v(8);
;;    call wson_#v(8);
;    call wsoff_#v(6);
;    call wson_#v(1);
;    call wsoff_#v(1);
;    call wsoff_#v(8-1);
    send_green_node FALSE
    NOP 2; use up "call" time
    wsoff_more NOP OFF_GLUE-3; leave 3 instr for loop
	PAGECHK green_loop; do this before decfsz
    decfsz WREG, F
    goto green_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return
#if 0
    NOP 1
;//TODO: why is this needed?
    wsoff_more NOP OFF_GLUE-2; leave 2 instr for call/goto
    call wsoff_#v(8);
    call wsoff_#v(8);
    goto wsoff_#v(8);
#endif

send_red_node macro want_last_bit
#if 1
    call wson_#v(8);
#else
    call wsoff_#v(8-2);
    call wson_#v(1);
    call wsoff_#v(1);
#endif
    call wsoff_#v(8);
    call wsoff_#v(8 - 1 + BOOL2INT(want_last_bit));
    endm

ws_all_red: DROP_CONTEXT;
    BANKCHK LATA;
    MOVLW UNIV_LEN / UNIV_SCALE; //+3; //TODO: why is +1 needed here?
red_loop:
    REPEAT LITERAL(UNIV_SCALE - 1), send_red_node TRUE
;;    call wson_#v(8);
;    call wsoff_#v(6);
;    call wson_#v(1);
;    call wsoff_#v(1);
;    call wsoff_#v(8);
;    call wsoff_#v(8-1);
    send_red_node FALSE
    NOP 2; use up "call" time
    wsoff_more NOP OFF_GLUE-3; leave 3 instr for loop
	PAGECHK red_loop; do this before decfsz
    decfsz WREG, F
    goto red_loop
;    REPEAT LITERAL(UNIV_LEN * 3 - 1), call wsoff_#v(8); //NOTE: 1-2 extra bytes here @end
    return;


    THREAD_DEF ws_player, 4

X_ws_player: DROP_CONTEXT;
    BANKCHK LATA;
    call ws_all_red
    WAIT 1 sec
    BANKCHK LATA;
    call ws_all_green
    WAIT 1 sec
    BANKCHK LATA;
    call ws_all_blue
    WAIT 1 sec
    BANKCHK LATA;
    call ws_all_off
    WAIT 1 sec
    goto ws_player

#if 0
test1:
;    ws_sendbyte LITERAL(0x02), ORG$, ORG$
;    ws_sendbyte LITERAL(0), ORG$, ORG$
;    ws_sendbyte LITERAL(0), ORG$, ORG$
    BANKCHK LATA
    call wsoff#v(6);
    call wson#v(1);
    call wsoff#v(1);
    call wsoff#v(8);
    call wsoff#v(8);
    WAIT 1 sec/2
;    ws_sendbyte LITERAL(0), ORG$, ORG$
;    ws_sendbyte LITERAL(0x02), ORG$, ORG$
;    ws_sendbyte LITERAL(0), ORG$, ORG$
    BANKCHK LATA
    call wsoff#v(8);
    call wsoff#v(6);
    call wson#v(1);
    call wsoff#v(1);
    call wsoff#v(8);
    WAIT 1 sec/2
    GOTO ws_player;
#endif

    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @216
;#else; too deep :(
#endif
#if HOIST == 4444-5; //hack: wsplayer
    messg hoist 4: HACK: wsplayer @220
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; wsplayer ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

    THREAD_DEF ws_player, 4

;ws player:
;runs autonomously, so no nullpx or central controller (or cables!) needed
;based on RenXt (Nov 2014)
;2 display modes: 1-bit (port) and 4-bit (port) parallel
;2 sources of display values: rom or ram
;loops thru a list of display commands:
;- display bitmap from rom
;- display bitmap from ram
;- modify bitmap in ram
; wait

#define PXOUT  RA4
#define UNIV_LEN  30; //<= 2x banked GPRAM (for in-memory bitmaps), else prog space
;//#define PARALLEL4

#define DECFSZ_HIBUMP  0x100; //kludge: compensate for decfsz on upper byte
#if DECFSZ_HIBUMP
 #define MOVF_HIDECFSZ  DECF; //compensate for +1 in upper byte
#else
 #define MOVF_HIDECFSZ  MOVF
#endif

#define TEST_BR  1; //255; //easier on the eyes
;#define FULL_BR  255;


;wson macro
;    setbit LATA, PXOUT, TRUE
;    endm
;wsoff macro
;    setbit LATA, PXOUT, FALSE
;    endm
#define withbit(bitnum, bitval)  withbit_#v((bitnum) * 2 + BOOL2INT(bitval))
withbit(PXOUT, FALSE) macro stmt
    stmt, PXOUT, FALSE
    endm
withbit(PXOUT, TRUE) macro stmt
    stmt, PXOUT, TRUE
    endm
;each WS281X bit takes 10 (2/3/5) instr @8 MIPS
;on bit is 5/5, off bit is 2/8
;idler2 + idler4 can be used for call/return or other processing (optional)
;caller is responsible for ensuring the correct #instr cycles used
    ERRIF FOSC_FREQ != 32 MHz, [ERROR] ws_sendbit assumes 8 MIPS @279
ws_sendbit macro rgb, bit, idler2, idler4 ;//DROP_CONTEXT;
    setbit LATA, PXOUT, TRUE; //bit start
    ifbit_const rgb, log2(bit), FALSE, withbit(PXOUT, FALSE) setbit LATA; //wsoff; //bit data
    LOCAL here1 = $
    idler2
    if $ == here1; //not passed from caller
        NOP here1 + 2 - $
    endif
    setbit LATA, PXOUT, FALSE; //bit end
    LOCAL here2 = $
    idler4
    if $ == here2; //not passed from caller
        NOP here + 4 - $
    endif
    endm

ws_sendbyte macro byte, last_idler2, last_idler4
    ws_sendbit byte, 0x80, ORG$, ORG$;
    ws_sendbit byte, 0x40, ORG$, ORG$;
    ws_sendbit byte, 0x20, ORG$, ORG$;
    ws_sendbit byte, 0x10, ORG$, ORG$;
    ws_sendbit byte, 0x08, ORG$, ORG$;
    ws_sendbit byte, 0x04, ORG$, ORG$;
    ws_sendbit byte, 0x02, ORG$, ORG$;
    ws_sendbit byte, 0x01, last_idler2, last_idler4;
    endm

;send const bit:
;wsbit macro onoff
;    setbit LATA, PXOUT, TRUE; //bit start
;    NOP 1
;    setbit LATA, PXOUT, onoff; //bit data
;    NOP 2
;    setbit LATA, PXOUT, FALSE; //bit end
;    NOP 4
;    endm

;//primary colors:  (try to maintain consistent power)
#define RED_dim(br)  (0x010000 * ((br) & 0xFF)); //0xFF0000
#define GREEN_dim(br)  (0x000100 * ((br) & 0xFF)); //0x00FF00
#define BLUE_dim(br)  (0x000001 * ((br) & 0xFF)); //0x0000FF
#define YELLOW_dim(br)  (0x010100 * ((br) & 0xFF)); //0xFFFF00
#define CYAN_dim(br)  (0x000101 * ((br) & 0xFF)); //0x00FFFF
#define MAGENTA_dim(br)  (0x01001 * ((br) & 0xFF)); //0xFF00FF
#define WHITE_dim(br)  (0x010101 * ((br) & 0xFF)); //0xFFFFFF
#define BLACK_dim(ignored)  0

;RGB color indexes:
;3 lsb control R/G/B on/off (for easier color combinations/debug):
;nope-4th bit is brightness
    CONSTANT RED_PALINX = 4;
    CONSTANT GREEN_PALINX = 2;
    CONSTANT BLUE_PALINX = 1;
;//#define BRIGHT(rgb)  ((rgb) + 8); brighter variant
    CONSTANT YELLOW_PALINX = RED_PALINX | GREEN_PALINX;
    CONSTANT CYAN_PALINX = GREEN_PALINX | BLUE_PALINX;
    CONSTANT MAGENTA_PALINX = RED_PALINX | BLUE_PALINX;
    CONSTANT PINK_PALINX = MAGENTA_PALINX; easier to spell :P
    CONSTANT WHITE_PALINX = RED_PALINX | GREEN_PALINX | BLUE_PALINX;
    CONSTANT OFF_PALINX = 0; "black"
;//    CONSTANT CUSTOM_PALINX = BRIGHT(0); caller-defined palette entry
    CONSTANT FB_PALINX = 8
    CONSTANT BG_PALINX = 9

;color palette:
;16 colors, 3 bytes each (4 bbp gives 6:1 compression)
;most commands use a fg and/or bg color
;    b0DCL PAL0, 3; //16 entries, 3 bytes each
;    REPEAT LITERAL(16), with_arg(3) b0DCL
;    nbDCL16 fgbg,; //TODO: could combine into 1 byte
setfg macro color
;    mov8 REGHI(fgbg), colorinx;
    mov24 PALENT#v(FG_PALINX), color
    endm
setbg macro color
;    mov8 REGLO(fgbg), colorinx;
    mov24 PALENT#v(BG_PALINX), color
    endm

    CONSTANT PALENT#v(OFF_PALINX) = LITERAL(0);
    CONSTANT PALENT#v(RED_PALINX) = LITERAL(RED_dim(TEST_BR));
    CONSTANT PALENT#v(GREEN_PALINX) = LITERAL(GREEN_dim(TEST_BR));
    CONSTANT PALENT#v(BLUE_PALINX) = LITERAL(BLUE_dim(TEST_BR));
    CONSTANT PALENT#v(YELLOW_PALINX) = LITERAL(YELLOW_dim(TEST_BR));
    CONSTANT PALENT#v(CYAN_PALINX) = LITERAL(CYAN_dim(TEST_BR));
    CONSTANT PALENT#v(MAGENTA_PALINX) = LITERAL(MAGENTA_dim(TEST_BR));
    CONSTANT PALENT#v(WHITE_PALINX) = LITERAL(WHITE_dim(TEST_BR));
    VARIABLE palent = 0;
    BANKCHK LATA; caller will preset BSR
;//    b0DCL PALETTE, 0;
    while palent < 16
        if palent >= 8; //first 8 colors are const
	    if palent >= 10
	        b0DCL PALENT#v(palent), 3; //last 8 colors are caller-specified
	    else
	        nbDCL PALENT#v(palent), 3; //make fg + bg non-banked for faster access
	    endif
	endif
	if palent == OFF_PALINX || palent == FB_PALINX
ws_sendpal_#v(palent):
;        REPEAT LITERAL(23), PALENT#v(palent)wsbit 
	    ws_sendbyte BYTEOF(PALENT#v(palent), 2), ORG$, ORG$;
	    ws_sendbyte BYTEOF(PALENT#v(palent), 1), ORG$, ORG$;
	    ws_sendbyte BYTEOF(PALENT#v(palent), 0), ORG$, return;
	endif
palent += 1
    endw

;adds 5 instr overhead:
ws_sendpal_inx:
    ANDLW 0x0F
    BRW
    REPEAT LITERAL(16), GOTO ws_sendpal_#v(palent);


    doing_init TRUE
;    setfg LITERAL(WHITE_PALINX);
;    setbg LITERAL(OFF_PALINX);
    setfg LITERAL(WHITE_dim(TEST_BR));
    setbg LITERAL(0);
;    memset(PALETTE, 0, 3 * 16);
;    REPEAT LITERAL(16), with_arg(LITERAL(0)) mov24 PALENT#v(REPEATER)
;my convention, first half palette always contains primary colors:
;    mov24 PALENT#v(OFF_PALINX), LITERAL(0);
;    mov24 PALENT#v(RED_PALINX), LITERAL(RED_dim(TEST_BR));
;    mov24 PALENT#v(GREEN_PALINX), LITERAL(GREEN_dim(TEST_BR));
;    mov24 PALENT#v(BLUE_PALINX), LITERAL(BLUE_dim(TEST_BR));
;    mov24 PALENT#v(YELLOW_PALINX), LITERAL(YELLOW_dim(TEST_BR));
;    mov24 PALENT#v(CYAN_PALINX), LITERAL(CYAN_dim(TEST_BR));
;    mov24 PALENT#v(MAGENTA_PALINX), LITERAL(MAGENTA_dim(TEST_BR));
;    mov24 PALENT#v(WHITE_PALINX), LITERAL(WHITE_dim(TEST_BR));
;second half of palette can be used for custom colors:
    REPEAT LITERAL(6), with_arg(LITERAL(0)) mov24 PALENT#v(REPEATER + 10)
    doing_init FALSE


X_ws_player: DROP_CONTEXT;
    setfg LITERAL(RED_dim(TEST_BR))
    BANKCHK LATA;
    REPEAT LITERAL(5), CALL ws_sendpal_#v(BG_PALINX):
    WAIT 1 sec/2;
    BANKCHK LATA;
    REPEAT LITERAL(1), CALL ws_sendpal_#v(FG_PALINX):
    REPEAT LITERAL(4), CALL ws_sendpal_#v(BG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(2), CALL ws_sendpal_#v(FG_PALINX):
    REPEAT LITERAL(3), CALL ws_sendpal_#v(BG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(3), CALL ws_sendpal_#v(FG_PALINX):
    REPEAT LITERAL(2), CALL ws_sendpal_#v(BG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(4), CALL ws_sendpal_#v(FG_PALINX):
    REPEAT LITERAL(1), CALL ws_sendpal_#v(BG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(5), CALL ws_sendpal_#v(FG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(1), CALL ws_sendpal_#v(BG_PALINX):
    REPEAT LITERAL(4), CALL ws_sendpal_#v(FG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(2), CALL ws_sendpal_#v(BG_PALINX):
    REPEAT LITERAL(3), CALL ws_sendpal_#v(FG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(3), CALL ws_sendpal_#v(BG_PALINX):
    REPEAT LITERAL(2), CALL ws_sendpal_#v(FG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(4), CALL ws_sendpal_#v(BG_PALINX):
    REPEAT LITERAL(1), CALL ws_sendpal_#v(FG_PALINX):
    WAIT 1 sec/2;
    REPEAT LITERAL(5), CALL ws_sendpal_#v(BG_PALINX):
    WAIT 1 sec/2;
    GOTO ws_player;


#if 0
WIPE macro color
;    mov8 WREG, colorinx
    setfg color
    CALL wipe
    endm

X_ws_player: DROP_CONTEXT;
;//custom commands here
    WIPE LITERAL(RED_dim(TEST_BR))
    WIPE LITERAL(GREEN_dim(TEST_BR))
    WIPE LITERAL(BLUE_dim(TEST_BR))
    WIPE LITERAL(YELLOW_dim(TEST_BR))
    WIPE LITERAL(CYAN_dim(TEST_BR))
    WIPE LITERAL(MAGENTA_dim(TEST_BR))
    WIPE LITERAL(WHITE_dim(TEST_BR))
    GOTO ws_player;

;DECFS_M1 macro reg, dest
;    INCF reg, F;
;    DECFSZ reg, dest
;    DECF reg, dest;
;    endm
    
;//    nbDCL16 count,;
    nbDCL wipe_counter,;
wipe: DROP_CONTEXT;
;    setfg WREG;
;//    mov16 count, LITERAL(UNIV_LEN + 1)
    mov8 wipe_counter, LITERAL(UNIV_LEN + 1); // + DECFSZ_HIBUMP);
;    incf HIBYTE16(FSR1), F; //kludge: compensate for decfsz 
wipe_loop: DROP_CONTEXT;
;try to do as much comp as possible < start tx; WS seems to tolereate slight delays between nodes, not not much
;    sub16 FSR0, LITERAL(UNIV_LEN), FSR1; //FSR0 = LITERAL(UNIV_LEN) - FSR1;
;    MOVF REGLO(FSR1), W;
;    SUBLW LOBYTE(LITERAL(UNIV_LEN+1 + 2 * DECFSZ_HIBUMP)) & 0xFF;
;    MOVWF REGLO(FSR0);
;    MOVF REGHI(FSR1), W;
;    SUBLWB HIBYTE16(LITERAL(UNIV_LEN+1 + 2 * DECFSZ_HIBUMP)) & 0xFF;
;    MOVWF REGHI(FSR0);
    mov8 WREG, wipe_counter;
    SUBLW UNIV_LEN + 1; //NUMPX + 2;
    WS_SENDFG WREG;
    DECF wipe_counter, W;
    WS_SENDBG WREG;
    WAIT 1 sec/4;
	PAGECHK wipe_loop; do this before decfsz
    DECFSZ wipe_counter, F;
    GOTO wipe_loop;
    return;

    nbDCL send_count,;
WS_SENDFG macro count
    ifbit EQUALS0 
    mov8 numpx, count;
send_loop: DROP_CONTEXT;
    CALL ws_sendfg;
    DECFS_M1 numpx, F;
    GOTO send_loop;
    endm

ws_sendfg: DROP_CONTEXT;
    mov8 WREG, fg;
    ANDLW 0x0F;
    REPEAT LITERAL(16), GOTO ws_sendpal_#v(REPEATER);

ws_sendbg: DROP_CONTEXT;
    mov8 WREG, bg;
    ANDLW 0x0F;
    REPEAT LITERAL(16), GOTO ws_sendpal_#v(REPEATER);
#endif
    
    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @528
;#else; too deep :(
#endif
#if HOIST == 44444; //hack: tester
    messg hoist 4: HACK: tester @532
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; tester ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

    THREAD_DEF ws_tester, 4

#define UNIV_LEN  4; //20; //800; //1600
;//#define SEND_FREQ  2 sec; //50 msec;

#define DECFSZ_HIBUMP  0x100; //kludge: compensate for decfsz on upper byte
#if DECFSZ_HIBUMP
 #define MOVF_HIDECFSZ  DECF; //compensate for +1 in upper byte
#else
 #define MOVF_HIDECFSZ  MOVF
#endif

#if 1
#define ws_send_px  ws_send_px_FAKE
						VARIABLE NUM_FAKE = 0;
ws_send_px macro rgb, want_wait, idler, idler2
    fps_init 1 sec/2; longer blip = color not off
    MOVF BYTEOF(rgb, 0) & 0xFF, W;
    IORWF BYTEOF(rgb, 1) & 0xFF, W;
    IORWF BYTEOF(rgb, 2) & 0xFF, W;
    LOCAL non0;
					        CONTEXT_SAVE bbbefore_if_#v(NUM_FAKE)
;BROKEN    ifbit EQUALS0 FALSE, GOTO non0;
    ORG $+2
    fps_init 1 sec/10; //shorter blip = off
non0:
					        CONTEXT_SAVE aaafter_#v(NUM_FAKE)
						CONTEXT_RESTORE bbbefore_if_#v(NUM_FAKE)
						ifbit EQUALS0 TRUE, GOTO non0;
						CONTEXT_RESTORE aaafter_#v(NUM_FAKE)
NUM_FAKE += 1
    setbit LATA, LEDOUT, TRUE;
    wait4frame ORG$, goto $-1; //ORG$, ORG$; 50 msec interval
    fps_init 1 sec/4; //make gap between blips consistent
    NOP 2; in case T0IF has latency
    setbit LATA, LEDOUT, FALSE;
    wait4frame ORG$, goto $-1; //ORG$, ORG$; 50 msec interval
    fps_init 2 sec
    endm
#endif


#define BRIGHTNESS  1; //255;
;//primary colors:  (try to maintain consistent power)
#define RED_TEST  (0x010000 * BRIGHTNESS * 3); //0xFF0000
#define GREEN_TEST  (0x000100 * BRIGHTNESS * 3); //0x00FF00
#define BLUE_TEST  (0x000001 * BRIGHTNESS * 3); //0x0000FF
#define YELLOW_TEST  (0x010100 * BRIGHTNESS * 2); //0xFFFF00
#define CYAN_TEST  (0x000101 * BRIGHTNESS * 2); //0x00FFFF
#define MAGENTA_TEST  (0x01001 * BRIGHTNESS * 2); //0xFF00FF
#define WHITE_TEST  (0x010101 * BRIGHTNESS); //0xFFFFFF

ws_tester: DROP_CONTEXT;
    ws_breakout_setup; eusart init @SPI 3x (~2.4 Mbps)
    fps_init 5 sec; //kludge: give PicKit time to settle
    wait4frame ORG$, goto $-1; //ORG$, ORG$; 50 msec interval

    fps_init 50 msec; 20 FPS; 1600 nodes == 80 sec
ws_loop: DROP_CONTEXT;
    mov24 ccolor, LITERAL(RED_TEST);
    CALL wipe; CAUTION: need to clear context for correct mov24 lit
    mov24 ccolor, LITERAL(GREEN_TEST);
    CALL wipe;
    mov24 ccolor, LITERAL(BLUE_TEST);
    CALL wipe;
    mov24 ccolor, LITERAL(YELLOW_TEST);
    CALL wipe;
    mov24 ccolor, LITERAL(CYAN_TEST);
    CALL wipe;
    mov24 ccolor, LITERAL(MAGENTA_TEST);
    CALL wipe;
    mov24 ccolor, LITERAL(WHITE_TEST);
    CALL wipe;
    GOTO ws_loop


					        VARIABLE NUM_SEND = 0;
send_repeat macro rgb
;loop: DROP_CONTEXT;
    LOCAL no_output, send_loop;//, RGB = rgb; DON'T use local (drops MSB_LIT flag)
    MOVF_HIDECFSZ REGHI(FSR0), W;
    IORWF REGLO(FSR0), W;
					        CONTEXT_SAVE before_if_#v(NUM_SEND)
;BROKEN    ifbit EQUALS0 TRUE, GOTO no_output; //return; //count is 0
    ORG $+2
;send_repeat_non0: DROP_CONTEXT; //call here only if count (FSR0) is non-0
;    incf HIBYTE16(FSR0), F; //kludge: compensate for decfsz 
send_loop: DROP_CONTEXT;
;    messg here1 @625
    ws_send_px rgb, +1, ORG$, goto $-1; busy-wait (should be YIELD); CAUTION: generates a lot of code; put it in sub
;    messg here2 @627
;    call send;
	PAGECHK send_loop; do this before decfsz
    decfsz REGLO(FSR0), F;
    goto send_loop
    decfsz REGHI(FSR0), F;
    goto send_loop
;    MOVF HIBYTE16(FSR0), F;
;    ifbit EQUALS0 FALSE, GOTO send_loop
;    mov8 WREG, INDF0_predec; //--FSR0;
;    return;
no_output: DROP_CONTEXT;
;kludge: mpasm lost label addr :(
						CONTEXT_SAVE after_#v(NUM_SEND)
						CONTEXT_RESTORE before_if_#v(NUM_SEND)
						ifbit EQUALS0 TRUE, GOTO no_output; //return; //count is 0
						CONTEXT_RESTORE after_#v(NUM_SEND)
NUM_SEND += 1
    endm


wipe: DROP_CONTEXT;
    mov16 FSR1, LITERAL(UNIV_LEN+1 + DECFSZ_HIBUMP);
;    incf HIBYTE16(FSR1), F; //kludge: compensate for decfsz 
wipe_loop:
;try to do as much comp as possible < start tx; WS seems to tolereate slight delays between nodes, not not much
;    sub16 FSR0, LITERAL(UNIV_LEN), FSR1; //FSR0 = LITERAL(UNIV_LEN) - FSR1;
    MOVF REGLO(FSR1), W;
    SUBLW LOBYTE(LITERAL(UNIV_LEN+1 + 2 * DECFSZ_HIBUMP)) & 0xFF;
    MOVWF REGLO(FSR0);
    MOVF REGHI(FSR1), W;
    SUBLWB HIBYTE16(LITERAL(UNIV_LEN+1 + 2 * DECFSZ_HIBUMP)) & 0xFF;
    MOVWF REGHI(FSR0);
;    setbit LATA, LEDOUT, TRUE;
    send_repeat ccolor
;nope- wipes out color for remainder of loop!    mov24 ccolor, LITERAL(0);
    mov16 FSR0, FSR1;
    mov8 WREG, INDF1_postdec; //--FSR1; //kludge: compensate for +1 above
;    setbit LATA, LEDOUT, FALSE;
    send_repeat LITERAL(0); //turn off remaining nodes
    wait4frame ORG$, goto $-1; //ORG$, ORG$; 50 msec interval
;    dec16 FSR1;
;    DECFSZ16 FSR1, F
	PAGECHK wipe_loop; do this before decfsz
    decfsz REGLO(FSR1), F
    goto wipe_loop
    decfsz REGHI(FSR1), F
    goto wipe_loop
    return;

;send:
;    ws_send_px ccolor, TRUE, ORG$, ORG$; busy-wait (should be YIELD); CAUTION: generates a lot of code; put it in sub
;    return;
 
;ws_send_px macro rgb24, wait_first, first_idler, more_idler
;pal_byte = BYTEOF(PALETTE_#v(CUSTOM_RGBINX), RGB_ORDER(palpiece / 3));
;	ws_encbyte pal_byte, ((palpiece % 3) + 1) / 3; custom palette entry requires run-time computation
;        whilebit xmit_ready(FALSE), NULL_STMT; CAUTION: TX1IF !valid until 2 instr after TX1REG; do next byte prep first
;        mov8 TX1REG, WREG; start xmit

    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @689
;#else; too deep :(
#endif
#if HOIST == 444-1; //OBSOLETE
    messg NO-hoist 4: fps tracking thread @693
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; fps tracking thread ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#if 0; //combined into rcv_frame thread for efficiency
    THREAD_DEF fps_tracking, 2

    nbDCL FPS_count,;
    nbDCL FPS_render,; save latest count so rendering can be done while counting frames

fps_tracking: DROP_CONTEXT;
;    fps_init 1 sec; do this in rcv_frame thread after running brkout_anim
;    mov8 count_FPS, LITERAL(0); FPS will be junk until rcv_frame is finished startup
fps_loop:
    mov8 FPS_render, FPS_count; rendered by brkout thread
    mov8 FPS_count, LITERAL(0); updated by rcv frame
    wait4frame YIELD, YIELD_AGAIN; 1 sec
;    wait4render YIELD, YIELD_AGAIN; don't change breakout px while being rendered
;use cyan for even frames (heartbeat):
;    set_brkout_px 24+0, FPS, 7, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+1, FPS, 6, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+2, FPS, 5, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+3, FPS, 4, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+4, FPS, 3, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+5, FPS, 2, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+6, FPS, 1, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+7, FPS, 0, WHITE_RGBINX, CYAN_RGBINX;
;    mov8 FPS, LITERAL(0);
;    wait4frame YIELD, YIELD_AGAIN; 1 sec
;    wait4render YIELD, YIELD_AGAIN; don't change breakout px while being rendered
;use magenta for odd frames (heartbeat):
;    set_brkout_px 24+0, FPS, 7, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+1, FPS, 6, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+2, FPS, 5, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+3, FPS, 4, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+4, FPS, 3, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+5, FPS, 2, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+6, FPS, 1, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+7, FPS, 0, WHITE_RGBINX, MAGENTA_RGBINX;
    goto fps_loop;
    
;wait4render macro idler, idler2
;    whilebit FSR0L, breakout_eof(FALSE), idler
;    whilebit FSR0L, breakout_eof(FALSE), idler2
;    endm
;set_brkout_px macro pxofs, val, bitnum, oncolor, offcolor
;    movlw offcolor
;    ifbit val, bitnum, TRUE, movlw oncolor
;    mov8 brkoutpx+pxofs, WREG;
;    endm
    
;;    CONSTANT BRKOUT#v(3)_RGBINX  CYAN_RGBINX; FPS
;    CONSTANT BRKOUT#v(4)_RGBINX  MAGENTA_RGBINX; alternate FPS (heartbeat)

    THREAD_END;
#endif; 0

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @753
;#else; too deep :(
#endif
#if HOIST == 444-2; //ABANDONED
    messg hoist 4: line conditioner (main logic) @757
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; line conditioner (main logic) ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

    THREAD_DEF line_conditioner, 2

line_conditioner: DROP_CONTEXT;
    ws_decode WREG, WANT_BIT | SETUP_FULL | SETUP_ONLY,; setup but don't decode
    ws_breakout_setup; eusart init @SPI 3x (2.4 Mbps)
loop: DROP_CONTEXT;
    wait2xmit YIELD, YIELD_AGAIN; wait before loading WREG to avoid save/restore
    mov8 TX1REG, WREG; start xmit
    goto line_conditioner;
    
    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 4 @776
;#else; too deep :(
#endif
#if HOIST == 6666-1
    messg hoist 6: rcv frame thread (main logic) @780
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; frame rcv thread (main logic) ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;    UGLY_PASS12FIX -1
;    messg #thr #v(NUM_THREADS), YIELD @786
    THREAD_DEF rcv_frame, 4
;    messg #thr #v(NUM_THREADS), YIELD @788

;    doing_init TRUE;
;    call brkout_anim; call this during init
;    doing_init FALSE;

wait4timeout macro idler, idler2
    idler; assume not ready yet, let other threads run
    ifbit LITERAL(1), 0, FALSE, idler2; more efficient than goto $-3 + call
    endm


;blink_1sec: DROP_CONTEXT;
rcv_frame: DROP_CONTEXT;
    CALL brkout_anim
    fps_init 1 sec
rcv_loop: DROP_CONTEXT;
    wait4timeout YIELD, YIELD_AGAIN;
    ifbit elapsed_fps, TRUE, CALL fps_update; render FPS 1x/sec during idle time at end of frame
    INCF FPS, F; assume !overflow; max FPS likely ~ 40 - 50
    messg TODO: wait for 50 usec, start rcv/xfr, trigger brkout render @808
#if 1; dev/test
    wait4frame YIELD, YIELD_AGAIN; 1 sec
    setbit LATA, LEDOUT, TRUE;
;    movlw 22;
;    BANKSAFE dest_arg(F) addwf FPS_render;
    wait4frame YIELD, YIELD_AGAIN; 1 sec
    setbit LATA, LEDOUT, FALSE;
;    movlw 10;
;    BANKSAFE dest_arg(F) addwf FPS_render;
#endif
;no    YIELD_AGAIN_inlined; only works if tos unchanged since yield!
    GOTO rcv_loop;


    nbDCL FPS,;
    CONSTANT FPS_RGBINX = CYAN_RGBINX; FPS
    CONSTANT FPS_RGBINX_ALT = MAGENTA_RGBINX; alternate FPS (heartbeat)
    CONSTANT HEARTBEAT_PARITY = RED_RGBINX; use this bit to distinguish heartbeat parity
    ERRIF(!((FPS_RGBINX ^ FPS_RGBINX_ALT) & HEARTBEAT_PARITY), [ERROR] heartbeat bit #v(HEARTBEAT_PARITY) can''t be used to check frame parity: #v(FPS_RGBINX ^ FPS_RGBINX_ALT) @827);

set_fps_pxbit macro bitnum
;    BANKCHK brkoutpx;
;    messg TODO ^^^ fix banksel in ifbit @831
    ifbit IIF(bitnum == 7, LITERAL(0), FPS), 7 - bitnum, TRUE, MOVWF brkoutpx + 24 + bitnum;
    endm

;render FPS breakout px then reset:
fps_update: DROP_CONTEXT;
    EXPAND_PUSH FALSE
    MOVLW WHITE_RGBINX;
    REPEAT LITERAL(8), MOVWF brkoutpx + 24 + REPEATER; set "on" color
    MOVLW FPS_RGBINX;
    ifbit FPS, 7, TRUE, MOVLW FPS_RGBINX_ALT; kludge: use top bit for heartbeat color
;    setbit FPS, 7, FALSE; strip heartbeat parity before render
    REPEAT LITERAL(8), set_fps_pxbit REPEATER; set "off" color
    CLRF FPS; restart frame count for next 1 sec
    ifbit WREG, log2(HEARTBEAT_PARITY), FPS_RGBINX & HEARTBEAT_PARITY, biton_#v(7) FPS; toggle parity
;    setbit elapsed_fps, FALSE;
    EXPAND_POP
    return;
;even_frame:
;use cyan for even frames (heartbeat):
;    set_brkout_px 24+0, FPS, 7, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+1, FPS, 6, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+2, FPS, 5, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+3, FPS, 4, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+4, FPS, 3, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+5, FPS, 2, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+6, FPS, 1, WHITE_RGBINX, CYAN_RGBINX;
;    set_brkout_px 24+7, FPS, 0, WHITE_RGBINX, CYAN_RGBINX;
;    mov8 FPS, LITERAL(0);
;    wait4frame YIELD, YIELD_AGAIN; 1 sec
;    wait4render YIELD, YIELD_AGAIN; don't change breakout px while being rendered
;use magenta for odd frames (heartbeat):
;    set_brkout_px 24+0, FPS, 7, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+1, FPS, 6, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+2, FPS, 5, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+3, FPS, 4, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+4, FPS, 3, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+5, FPS, 2, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+6, FPS, 1, WHITE_RGBINX, MAGENTA_RGBINX;
;    set_brkout_px 24+7, FPS, 0, WHITE_RGBINX, MAGENTA_RGBINX;


#if 0; dev/debug test
    messg REMOVE THIS
    mov8 brkoutpx+0, LITERAL(RED_RGBINX);
    CALL anim_delay;
    mov8 brkoutpx+8, LITERAL(GREEN_RGBINX);
    CALL anim_delay;
    mov8 brkoutpx+16, LITERAL(BLUE_RGBINX);
    CALL anim_delay;
    mov8 brkoutpx+24, LITERAL(YELLOW_RGBINX);
    CALL anim_delay;
    mov8 brkoutpx+0, LITERAL(OFF_RGBINX);
    mov8 brkoutpx+8, LITERAL(OFF_RGBINX);
    mov8 brkoutpx+16, LITERAL(OFF_RGBINX);
    mov8 brkoutpx+24, LITERAL(OFF_RGBINX);
    return;
#endif


;show a little animation on power-up:
;turn on 1 breakout px at a time then alternate them a few times
;NOTE: this interferes with FPS tracking; use only at startup
;use FSR1 to set animation, FSR0 to send it
brkout_anim: DROP_CONTEXT;
#if 0; dev/test
    fps_init 1 sec;
    brkout_fill RED_RGBINX; //shows blue
    CALL anim_delay;
    brkout_fill OFF_RGBINX;
    CALL anim_delay;
    brkout_fill GREEN_RGBINX; //shows red
    CALL anim_delay;
    brkout_fill OFF_RGBINX;
    CALL anim_delay;
    brkout_fill BLUE_RGBINX; //shows green
    CALL anim_delay;
    brkout_fill OFF_RGBINX;
    CALL anim_delay;
    brkout_fill YELLOW_RGBINX; //shows blue
    CALL anim_delay;
    brkout_fill OFF_RGBINX;
    CALL anim_delay;
    brkout_fill MAGENTA_RGBINX; //shows red
    CALL anim_delay;
    brkout_fill OFF_RGBINX;
    CALL anim_delay;
    brkout_fill CYAN_RGBINX; //shows green
    CALL anim_delay;
    brkout_fill OFF_RGBINX;
    CALL anim_delay;
    brkout_fill WHITE_RGBINX;
    CALL anim_delay;
    GOTO all_off;
#endif
    fps_init 1 sec / 32; 100 msec; CAUTION: reusing FPS timer
    CALL all_off;
    mov16 FSR1, LITERAL(brkoutpx); //rewind
red_anim: ;DROP_CONTEXT;
    mov8 INDF1_postinc, LITERAL(RED_RGBINX); //turn on 1/@time
    CALL anim_delay;
    ifbit FSR1L, log2(8), !((brkoutpx + 8) & 8), GOTO red_anim; still doing first byte
green_anim: ;DROP_CONTEXT;
    mov8 INDF1_postinc, LITERAL(GREEN_RGBINX); //turn on 1/@time
    CALL anim_delay;
    ifbit FSR1L, log2(16), !((brkoutpx + 16) & 16), GOTO green_anim; still doing second byte
blue_anim: ;DROP_CONTEXT;
    mov8 INDF1_postinc, LITERAL(BLUE_RGBINX); //turn on 1/@time
    CALL anim_delay;
    ifbit FSR1L, log2(8), !((brkoutpx + 24) & 8), GOTO blue_anim; still doing third byte
fps_anim: ;DROP_CONTEXT;
    mov8 INDF1_postinc, LITERAL(FPS_RGBINX); //turn on 1/@time
    CALL anim_delay;
    ifbit FSR1L, log2(64), !((brkoutpx + 32) & 64), GOTO fps_anim; still doing fourth byte
#if 0
    fps_init 1 sec; 500 msec;
alt_loop:
    MOVLW WHITE_RGBINX;
    REPEAT LITERAL(SIZEOF(brkoutpx) / 2), MOVWF brkoutpx + REPEATER * 2; set "on" color every other px
    CALL anim_delay;
    REPEAT LITERAL(SIZEOF(brkoutpx) / 2), swap_pair REPEATER * 2; alternate
    CALL anim_delay;
    REPEAT LITERAL(SIZEOF(brkoutpx) / 2), swap_pair REPEATER * 2; alternate
    CALL anim_delay;
    REPEAT LITERAL(SIZEOF(brkoutpx) / 2), swap_pair REPEATER * 2; alternate
    CALL anim_delay;
    REPEAT LITERAL(SIZEOF(brkoutpx) / 2), swap_pair REPEATER * 2; alternate
    CALL anim_delay;
#endif
;    CALL all_off; leave brkout px initialized to all "off" color
;    return;
    mov16 FSR1, LITERAL(brkoutpx); //rewind
off_anim: ;DROP_CONTEXT;
    mov8 INDF1_postinc, LITERAL(OFF_RGBINX); //turn on 1/@time
    CALL anim_delay;
    ifbit FSR1L, log2(64), !((brkoutpx + 32) & 64), GOTO off_anim; still doing fourth byte
;fall thru ...

;turn all breakout px off and display for 1 frame:
all_off: DROP_CONTEXT;
;    mov16 FSR1, LITERAL(brkoutpx);
;    MOVLW OFF_RGBINX;
;off_loop: ;DROP_CONTEXT;
;    mov8 INDF1_postinc, WREG; LITERAL(OFF_RGBINX);
;;    ifbit FSR0L, log2(END_DETECT), !(ENDOF(brkoutpx) & END_DETECT), goto off_loop;
;    ifbit FSR1L, breakout_eof(FALSE), GOTO off_loop;
;    whilebit FSR1L, breakout_eof(FALSE), MOVWF INDF1_postinc;
;    CALL anim_delay;
;    return
    brkout_fill OFF_RGBINX;
;fall thru ...

;send breakout px then delay for animation:
anim_delay: DROP_CONTEXT;
;    call brkoutpx_sendall;
;    mov16 FSR0, LITERAL(brkoutpx);
    render_busy TRUE;
;anim_loop: DROP_CONTEXT
;    mov8 WREG, INDF0_postinc
;    call ws_send_palette
;    wait_msec 100,; animation speed
;    whilebit elapsed_fps, FALSE, ;goto no_fps_update
    wait4frame YIELD, YIELD_AGAIN; 1/10 sec; assume breakout is written by now (takes < 1 msec)
;    ifbit FSR0L, log2(64), !((brkoutpx + 32) & 64), goto anim_loop; send more breakout px
    return;

    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 6 @1001
;#else; too deep :(
#endif
#if HOIST == 5555-1
    messg hoist 5: brkout render thread @1005
    LIST_PUSH TRUE
    EXPAND_PUSH FALSE
;; breakout render thread ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
    
;RGB color indexes:
;3 lsb control R/G/B on/off (for easier color combinations/debug):
;4th bit is brightness
    CONSTANT RED_RGBINX = 4;
    CONSTANT GREEN_RGBINX = 2;
    CONSTANT BLUE_RGBINX = 1;
#define BRIGHT(rgb)  ((rgb) + 8); brighter variant
    CONSTANT YELLOW_RGBINX = RED_RGBINX | GREEN_RGBINX;
    CONSTANT CYAN_RGBINX = GREEN_RGBINX | BLUE_RGBINX;
    CONSTANT MAGENTA_RGBINX = RED_RGBINX | BLUE_RGBINX;
    CONSTANT PINK_RGBINX = MAGENTA_RGBINX; easier to spell :P
    CONSTANT WHITE_RGBINX = RED_RGBINX | GREEN_RGBINX | BLUE_RGBINX;
    CONSTANT OFF_RGBINX = 0; "black"
    CONSTANT CUSTOM_RGBINX = BRIGHT(0); caller-defined palette entry
;0, B, G, C, R, M, Y, W

;indexed color palette:
;palette consists of 15 hard-coded colors + 1 caller-defined custom color
    nbDCL24 ccolor; caller-defined custom color
;use EQU to show 32 bit values in .LST
;primary colors (dim):
PALETTE_#v(OFF_RGBINX) EQU LITERAL(0); off
PALETTE_#v(RED_RGBINX) EQU LITERAL(0x020000); red dim
PALETTE_#v(GREEN_RGBINX) EQU LITERAL(0x000200); green dim
PALETTE_#v(YELLOW_RGBINX) EQU LITERAL(0x010100); yellow dim; try to keep consistent brightness with single colors
PALETTE_#v(BLUE_RGBINX) EQU LITERAL(0x000002); blue dim
PALETTE_#v(MAGENTA_RGBINX) EQU LITERAL(0x010001); magenta dim; try to keep consistent brightness with single colors
PALETTE_#v(CYAN_RGBINX) EQU LITERAL(0x000101); cyan dim; try to keep consistent brightness with single colors
PALETTE_#v(WHITE_RGBINX) EQU LITERAL(0x010101); white dim; try to keep consistent brightness with single colors
;primary colors (bright):
PALETTE_#v(BRIGHT(RED_RGBINX)) EQU LITERAL(0xFF0000); red bright
PALETTE_#v(BRIGHT(GREEN_RGBINX)) EQU LITERAL(0x00FF00); green bright
PALETTE_#v(BRIGHT(YELLOW_RGBINX)) EQU LITERAL(0x808000); yellow bright; try to keep consistent brightness with single colors
PALETTE_#v(BRIGHT(BLUE_RGBINX)) EQU LITERAL(0x0000FF); blue bright
PALETTE_#v(BRIGHT(MAGENTA_RGBINX)) EQU LITERAL(0x800080); magenta bright; try to keep consistent brightness with single colors
PALETTE_#v(BRIGHT(CYAN_RGBINX)) EQU LITERAL(0x008080); cyan bright; try to keep consistent brightness with single colors
PALETTE_#v(BRIGHT(WHITE_RGBINX)) EQU LITERAL(0x555555); white dim; try to keep consistent brightness with single colors
PALETTE_#v(CUSTOM_RGBINX) EQU ccolor; caller-defined palette entry


;display buffer:
;#define NUMPX  #v(24 + 8); 24 px for first wspixel received + 8 px for fps
;    b0DCL brkoutpx:#v(NUMPX/2); 1 nibble per pixel (color indexed); FSR# handles banking
    b0DCL brkoutpx,:(24 + 8) / 1; 1/2 byte per pixel (color indexed): 24px for first rcv pixel + 8 px for fps; FSR# handles banking
    find_msb ENDOF(brkoutpx);
;    messg #v(FOUND_MSB), #v(ENDOF(brkoutpx)) @1055
;TODO? 4 bpp, 2 px/byte
;TODO? linear addr?
;check if fsr is at breakout eof:
;CAUTION: uses linear addr + assumes power of 2
;#define END_DETECT  SIZEOF(brkoutpx); (0x20 + 24+8); 0X40; BIT(5); CAUTION: only works with power of 2
    if ENDOF(brkoutpx) == FOUND_MSB; can use single-bit check
#define breakout_eof(yesno)  log2(ENDOF(brkoutpx)), IIF(brkoutpx & ENDOF(brkoutpx), !(yesno), yesno); BOOL2INT(brkoutpx & ENDOF(brkoutpx)) ^ BOOL2INT(yesno)
    messg [INFO] #brkout pxbuf #v(SIZEOF(brkoutpx)) @#v(brkoutpx), eof@ #v(ENDOF(brkoutpx)), detect& #v(brkoutpx & ENDOF(brkoutpx)) @1063
;    ERRIF((ENDOF(brkoutpx) - 1) & END_DETECT == ENDOF(brkoutpx) & END_DETECT, [ERROR] pixelbuf end detect broken, !span #v(END_DETECT): #v(brkoutpx) @1064)
;    messg ENDOF(brkoutpx) #v(ENDOF(brkoutpx))
;    messg log2(ENDOF(brkoutpx)) #v(log2(ENDOF(brkoutpx)))
;    messg ENDOF(brkoutpx), #v(ENDOF(brkoutpx))
    ERRIF(!log2(ENDOF(brkoutpx)), [ERROR] breakout pxbuf end detect !power of 2: #v(ENDOF(brkoutpx))"," simple bit test won''t work @1068)
#else
    error TODO: brkoupx eof check: #v(ENDOF(brkoutpx)) @1070
#endif

;#define render_busy(yesno)  mov16 FSR0, LITERAL(IIF(yesno, brkoutpx, ENDOF(brkoutpx)))
render_busy macro yesno
    if !(yesno) && (ENDOF(brkoutpx) == FOUND_MSB); use single-bit check
	setbit FSR0L, breakout_eof(TRUE); just set eof bit (faster than setting entire FSR0)
	exitm
    endif
    mov16 FSR0, LITERAL(IIF(yesno, brkoutpx, ENDOF(brkoutpx)))
    endm

wait2render macro idler, idler2
    EXPAND_PUSH FALSE
;    ifbit FSR0L, breakout_eof(TRUE), idler; goto brkout_wait; log2(64), !((brkoutpx + 32) & 64), goto brkout_loop; nothing to send
    idler; assume not ready yet, let other threads run
    ifbit FSR0L, breakout_eof(TRUE), idler2; goto brkout_wait; log2(64), !((brkoutpx + 32) & 64), goto brkout_loop; nothing to send
    EXPAND_POP
    endm

;swap a pair of pixels:
swap_pair macro ofs
    swapreg brkoutpx + ofs, brkoutpx + (ofs ^ 1)
    endm

;brkoutpx initial state:
;    more_init TRUE;
;    mov16 FSR0, LITERAL(brkoutpx);
;    movlw OFF_RGBINX;
;brkout_initloop:
;    mov8 INDF0_postinc, WREG;
;    ifbit FSR0L, breakout_eof(FALSE), goto brkout_initloop;
;    more_init FALSE

;breakout byte pixel colors:
;#define FPS_RGBINX  CYAN_RGBINX
;    CONSTANT BRKOUT#v(0)_RGBINX  RED_RGBINX; first byte
;    CONSTANT BRKOUT#v(1)_RGBINX  GREEN_RGBINX; second byte
;    CONSTANT BRKOUT#v(2)_RGBINX  BLUE_RGBINX; third byte
;    CONSTANT BRKOUT#v(3)_RGBINX  CYAN_RGBINX; FPS
;    CONSTANT BRKOUT#v(4)_RGBINX  MAGENTA_RGBINX; alternate FPS (heartbeat)

    
    THREAD_DEF brkout_render, 4

#if 0; uses a lot of prog space
;send palette entry to next WS pixel:
    VARIABLE palinx = 0;
    while palinx < 16
ws_send_pal#v(palinx): DROP_CONTEXT;
	ws_send_px PALETTE_#v(palinx), TRUE, YIELD, YIELD_AGAIN; 3x3 bytes
	return;
palinx += 1;
    endw
;in: WREG contains color index (4-bit value); caller can pack 2/byte if desired
ws_send_palette: DROP_CONTEXT
    andlw 0x0F;
    brw;
    while palinx < 16+16
	goto ws_send_pal#v(palinx % 16); 3x3 bytes
palinx += 1;
    endw
#endif
;want expand to:
;repeat:
;;    ifbit xmit_ready(TRUE), goto around
;;    YIELD;
;;    ifbit xmit_ready(FALSE), YIELD_AGAIN; more efficient than goto $-3 + call
;;    dont-goto repeat
;;around:
;    ifbit xmit_ready(FALSE), YIELD;
;    ifbit xmit_ready(FALSE), YIELD_AGAIN; more efficient than goto $-3 + call
    
;in: WREG = palinx
;piece:
;  1, 2, 3 to get entire byte
;or 1/3, 2/3, 3/3 to get SPI3x-encoded piece of byte
;unneeded: get_palent_byte macro piece
;    andlw 0x0F;
;    brw
;    LOCAL WHICH = SPI3x_detect(piece); 1, 2, 4 (SPI3x pieces) or 3, 6, 12 (bytes)
;    LOCAL palinx = 0
;    while palinx < 15
;	if !(WHICH % 3); whole byte
;	    retlw BYTEOF(PALETTE_#v(palinx), (piece) - 1);
;	else; partial byte
;	    ws_encbyte BYTE, 2/3; before wait so it's ready
;    messg TODO: ^^^ needs work @1157
;	    return;
;	endif
;    endm

;    doing_init TRUE
;    ws_breakout_setup;
;    doing_init FALSE;

brkout_fill macro color
    mov16 FSR1, LITERAL(brkoutpx);
    MOVLW color;
    whilebit FSR1L, breakout_eof(FALSE), MOVWF INDF1_postinc;
    endm

;use FSR0 to send breakout, leave FSR1 for caller to use for animation or render
brkout_render: DROP_CONTEXT;
    ws_breakout_setup; eusart init @SPI 3x (2.4 Mbps)
    render_busy(FALSE); set empty outbuf
;    mov16 FSR0, LITERAL(ENDOF(brkoutpx)); set empty outbuf
brkout_loop: DROP_CONTEXT;
;    setbit LATA, BREAKOUT, TRUE;
;    wait4frame YIELD, YIELD_AGAIN; 1 sec
;    NOP 16
;    setbit LATA, BREAKOUT, FALSE;
;    wait4frame YIELD, YIELD_AGAIN; 1 sec
;    NOP 16
;    ifbit FSR0L, breakout_eof(TRUE), YIELD; goto brkout_wait; log2(64), !((brkoutpx + 32) & 64), goto brkout_loop; nothing to send
;    ifbit FSR0L, breakout_eof(TRUE), YIELD_AGAIN; goto brkout_wait; log2(64), !((brkoutpx + 32) & 64), goto brkout_loop; nothing to send
    wait2render YIELD, YIELD_AGAIN; only yield 1x/breakout px; this prevents unexpected gaps during WS xmit (better tolerated *between* WS px); breakout px only needs to be rendered when rcv_frame is idle (at end of frame)
    VARIABLE pxpiece = 0;
    while pxpiece < 3*3; each px takes 9 bytes (3 rgb bytes * 3 SPI bytes)
;        wait2xmit YIELD, YIELD_AGAIN; wait before loading WREG to avoid save/restore
        mov8 WREG, IIF(pxpiece == 9-1, INDF0_postinc, INDF0);
        CALL get_palent_encpiece_#v(pxpiece);
;        ws_send_byte WREG, TRUE, YIELD, YIELD_AGAIN;
;       ws_encbyte BYTE, 2/3; after wait to protect WREG, but might cause latency
        whilebit xmit_ready(FALSE), NULL_STMT; CAUTION: TX1IF !valid until 2 instr after TX1REG; do next byte prep first
        mov8 TX1REG, WREG; start xmit
pxpiece += 1
    endw
    GOTO brkout_loop;
;no    YIELD_AGAIN_inlined; only works if tos unchanged since yield!


generate_get_palent macro
;    EXPAND_PUSH FALSE
    VARIABLE palpiece = 0, palent = 0, pal_byte;
    while palpiece < 3 * 3
;	EXPAND_PUSH TRUE
;pal byte HI first/second/third piece, byte MID first/second/third piece, byte LO first/second/third piece:
	EMITL get_palent_encpiece_#v(palpiece): DROP_CONTEXT;
;	addlw 7; kludge: move rgbinx 8 to last position in lookup table; this allows run-time code to take > 1 instr without additional jump
	EMIT andlw 0x0F;
	EMIT brw;
;	EXPAND_POP
	while palent < 16 * (palpiece + 1)
	    if (palent % 16) != CUSTOM_RGBINX; const palette entries can be encoded at compile time
;line too long :(	        retlw SPI3x_#v(palpiece % 3)(BYTEOF(PALETTE_#v(palent % 16), palpiece / 3));
;		EXPAND_PUSH TRUE
pal_byte = BYTEOF(PALETTE_#v(palent % 16), RGB_ORDER(palpiece / 3));
		EMIT retlw SPI3x_#v(palpiece % 3)(pal_byte); #v(pal_byte)
;		EXPAND_POP
	    else
		EMIT bra custom_palent_encpiece_#v(palpiece)
	    endif
palent += 1
	endw
;	EXPAND_PUSH TRUE
	EMITL custom_palent_encpiece_#v(palpiece): DROP_CONTEXT;
;line too long :(	ws_encbyte BYTEOF(PALETTE_#v(15), palpiece / 3), ((palpiece % 3) + 1) / 3; custom palette entry requires run-time computation
pal_byte = BYTEOF(PALETTE_#v(CUSTOM_RGBINX), RGB_ORDER(palpiece / 3));
	ws_encbyte pal_byte, ((palpiece % 3) + 1) / 3; custom palette entry requires run-time computation
	EMIT return;
;	EXPAND_POP
palpiece += 1
    endw
;    EXPAND_POP
    endm
    generate_get_palent; kludge: need macro wrapper for expand push/pop


    THREAD_END;

    EXPAND_POP
    LIST_POP
    messg end of hoist 5 @1243
;#else; too deep :(
#endif
#if HOIST == 3
    messg hoist 3: app helpers @1247
    LIST_PUSH FALSE; TRUE
    EXPAND_PUSH FALSE
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;TODO: update this:
;peripherals:
;NOTE: PPS is locked and each WS output segment has its own CLC to copy RA3, rather than changing PPS all the time
;#define WSSYNC  3; PWM# generate WS data sync pulse
;#define WSPASS  1; CLC# pass-thru WS input -> output
;#define WSDO  2; CLC# generate composite WS data signal
;#define ONESHOT  3; CLC# to generate one-shot 0.5 usec pulse triggered by WS data signal


;; WS281X stream input ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
    
;use CCP1 + Timer1 to get next bit of WS input stream:
;for decode (first input pixel), single pulse mode is used to measure width of pulse
;for wait (subsequent input pixels), input pulses are just counted as they pass through
;see AN1473 for details about Single-Pulse mode
;maybe also some useful tips on TU16A/B from https://github.com/microchip-pic-avr-examples/pic18f47q84-utmr-decoding-ws2812-datastream
;no-only gives multiples of 4: #define T1SRC_FOSC  b'0010'; try to be as accurate as possible; should be in p16f15313.inc
#define T1SRC_HFINTOSC  b'0011'; try to be as accurate as possible; should be in p16f15313.inc
#define T1SRC_LC3OUT  b'1100'; should be in p16f15313.inc
#define T1GATE_LC1OUT  b'01101'; LC1_out should be in p16f15313.inc
#define T1GATE_LC4OUT  b'10000'; LC4_out should be in p16f15313.inc
#define T1_prescale  log2(1) ;(0 << T1CKPS0); 1-to-1 pre-scalar
;#define T1_prescale_wsbyte  log2(8); 1-to-8 pre-scalar
#define WSBIT_THRESHOLD  (FOSC_FREQ / (2 MHz)); 0.5 usec @32 MHz 1:1 = 16 ticks
;#define wait4_wsbit  whilebit PIR5, TMR1GIF, FALSE, ;goto $-1; wait acq
;#define wait4_wsbyte  whilebit PIR4, TMR1IF, FALSE, ;goto $-1; wait for overflow (1 byte received)
;    VARIABLE T1INIT_COUNT = 0
;mode special values:
    CONSTANT SETUP_FULL = 0x80;
    CONSTANT SETUP_PART = 0x40;
    CONSTANT SETUP_ONLY = 0x10;
    CONSTANT WAIT_4PX = 2;
    CONSTANT WANT_BIT = 1;
ws_decode macro reg, mode, idler
;    LOCAL wait_byte = ISLIT(reg); reg => decode bit, lit => wait byte
    LOCAL wait_mode = (mode) & (WAIT_4PX | WANT_BIT);
    LOCAL setup_mode = (mode) & (SETUP_FULL | SETUP_PART);
    WARNIF(wait_mode != WAIT_4PX && wait_mode != WANT_BIT), [ERROR] which wait mode?, #v(mode));
    WARNIF(setup_mode == (SETUP_FULL | SETUP_PART), [ERROR] which setup mode?, #v(mode));
    if setup_mode; & (SETUP_FULL | SETUP_PART); want_init
;	if !T1INIT_COUNT; only need to do this 1x
	if (mode) & SETUP_FULL
	    mov8 T1GPPS, LITERAL(RA#v(WSDI)); T1GSS_LC1OUT);
	    mov8 T1CON, LITERAL(NOBIT(TMR1ON) | T1_prescale << T1CKPS0 | XBIT(T1SYNC) | BIT(T1RD16)); Timer 1 disabled during config, 1:1 prescalar, 16 bit read, async (ignored for GSPM)
	    mov8 T1GATE, LITERAL(T1GATE_LC#v(WSPASS)OUT); RA3 already goes in to CLC1 so reuse it here; T1GPPS_PPS); =T1GPPS;
	else; re-init
	    setbit T1CON, TMR1ON, FALSE; is this needed?
	endif
	if (mode) & WAIT_4PX ;wait_byte; count bits
	    mov8 T1GCON, LITERAL(NOBIT(T1GE) | NOBIT(T1GSPM) | BIT(T1GPOL) | NOBIT(T1GTM) | NOBIT(T1GGO)); always count, active high, no toggle, don't acquire yet
	    mov8 T1CLK, LITERAL(LC#v(WSPASS)IN); ws input signal
	else; decode bit
	    mov8 T1GCON, LITERAL(BIT(T1GE) | BIT(T1GSPM) | BIT(T1GPOL) | NOBIT(T1GTM) | NOBIT(T1GGO)); Gate Single-Pulse mode, active high, no toggle, don't acquire yet
	    mov8 T1CLK, LITERAL(T1SRC_HFINTOSC); 32 MHz (32.5 nsec reslution)
	endif
	setbit T1CON, TMR1ON, TRUE;
;T1INIT_COUNT += 1
	if (mode) & SETUP_ONLY; want_init == SETUP_ONLY
	    exitm
	endif
    endif
    if (mode) & WAIT_4PX; wait_byte
;        ws_clrwdt FALSE; restart eof timeout
;	mov16 TMR1, LITERAL(-8);
;        setbit PIR4, TMR1IF, FALSE;
;	ifbit PIR4, TMR1IF, FALSE, goto $-1; wait for overflow (1 byte received)
;        whilebit PIR4, TMR1IF, FALSE, idler; wait for overflow (1 byte received)
;	wait4_wsbyte idler
;        ws_clrwdt FALSE; restart eof timeout
;        wait_usec -1,; restart ws timeout
        REPEAT reg, wait4px idler;
	exitm
    endif
    setbit T1GCON, T1GGO, TRUE; start acq
;    ifbit PIR5, TMR1GIF, FALSE, goto $-1; wait acq
    whilebit PIR5, TMR1GIF, FALSE, idler; wait for acq
;    wait4_wsbit idler
    mov8 WREG, TMR1L
    addlw (0 - WSBIT_THRESHOLD) & 0xFF; Borrow => ws 0 bit, !Borrow (Carry) => ws 1 bit
    BANKCHK reg
    BANKSAFE _ARG(F) rlf reg;, F; rotate Carry into lsb
    endm

;wait for 4 ws px:
wait4px macro idler
    REPEAT 4, waitpx idler; reset ws latch timeout after each px
    endm

;wait for ws px (24 data bits):
waitpx macro idler
;    setbit T1CON, TMR1ON, FALSE; is this needed?
    mov16 TMR1, LITERAL(-3 * 8); 1 px (24 WS data bits)
    setbit PIR4, TMR1IF, FALSE;
;    setbit T1CON, TMR1ON, TRUE;
;	ifbit PIR4, TMR1IF, FALSE, goto $-1; wait for overflow (1 byte received)
    whilebit PIR4, TMR1IF, FALSE, idler; wait for overflow (1 byte received)
    wait_usec -1,; restart ws timeout after each px rcv
    endm


;; WS281X stream output ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;see AN1606 for details about custom SPI peripheral using CLC + Timer2 + PWM + MSSP (CAUTION: AN1606 is half-speed)
;see https://deepbluembedded.com/spi-tutorial-with-pic-microcontrollers/
;don't see https://ww1.microchip.com/downloads/en/Appnotes/TB3192-Using-the-SPI-Module-on-8-Bit-PIC-MCUs-90003192A.pdf
;TOO COMPLICATED!  
;TOO COMPLICATED!
;TOO COMPLICATED!
;instead, just use EUSART in synchronous master mode to send WS281X data stream using SPI @3x speed


;set up EUSART to send WS281X breakout data:
;TOO COMPLICATED: generate WS breakout output via SPI using Timer 2, PWM, MSSP, using CLC to combine them:
;see AN1606 using Timer 2 + PWM + MSSP (SPI Master) + CLC to generate WS281X stream is interesting but too complicated!
;instead, just use EUSART in synchronous mode at 3x speed (2.4 MHz); only requires 1-to-3 encoding, no extra peripherals
;RX/DT + TX/CK pins are output for sync xmit; TX/CK not needed by WS281X
;serial data bits change on leading edge, one clock cycle per bit
;xmit starts by writing to TX1REG
#define OUTPPS_DT1  0x10; should be in p16f15313.inc
#define OUTPPS_TX1_CK1  0x0F; should be in p16f15313.inc
#define MY_BRG(freq)  (FOSC_FREQ / (freq) / 4 - 1); SYNC = 1, BRG16 = 1, BRGH = x
    messg [INFO] uart 16-bit brg MY_BRG(2400 KHz)) = #v(MY_BRG(2400 KHz)) @1373
#define BRKOUT_BITREV; CAUTION: EUSART sends lsb first, WS281X wants msb first; need to reverse bit order :(
#define TUNED(freq)  ((freq) * 10/9); use this in other freq calculations to compensate for OSCTUNE
#define UNTUNED(freq)  ((freq) * 9/10); use this in other freq calculations to compensate for OSCTUNE
ws_breakout_setup macro
;    EXPAND_PUSH FALSE
    mov8 RA#v(BREAKOUT)PPS, LITERAL(OUTPPS_DT1);
#if 1; TX1/CK1 def = RA0, RX1/DT1 = RA1; can't just leave it that way (will override TRISA/LATA)??
;https://www.microchip.com/forums/m973921.aspx
    mov8 RX1DTPPS, LITERAL(RA#v(BREAKOUT)); kludge: datasheet says RX and DT should be same pin; RX never used so seems safe
    mov8 TX1CKPPS, LITERAL(RA3);  kludge: don't want clock to go to an I/O pin (peripheral overrides pin general-purpose output); send it to RA3 which has no output driver
    messg TODO: ^^^ are these 2 needed?; def = RA1/RA0; doc says DT and RX should be same pin in Sync mode
#endif
;    setbit TRISA, WSDI, TRUE; datasheet says to set TRIS for peripheral pins; that is just to turn off general-purpose output drivers
    setbit TRISA, RA#v(BREAKOUT), TRUE; datasheet says to set TRIS for peripheral pins (to turn off general-purpose output drivers)
;AN244 says OSCTUNE will adjust FSOC +/-12%; to get -10%, use 10%/12% * 0x20 ~= 0x1B; NOTE: this is just approx since temp also affects FOSC
    mov8 OSCTUNE, LITERAL(0x20 * 10/12); -32 & 0xFF); 32 MHz / 12 => 2.7 MHz which is slightly too fast for WS281x; need to slow it down 10%; 0x1f = max, 0x20 = min, 0 = center freq
    mov8 RC1STA, LITERAL(NOBIT(SPEN) | NOBIT(SREN) | NOBIT(CREN)); disable EUSART during config, disable single + continuous rcv (for xmit mode)
;NOTE NOTE NOTE NOTE NOTE: datasheet says TXEN will be overridden by SYNC, but TX1IF won't be set unless TXEN is set!
    mov8 TX1STA, LITERAL(BIT(CSRC) | NOBIT(TX9) | BIT(TXEN) | BIT(SYNC_TXSTA) | BIT(BRGH)); enable sync master mode, high baud rate (ignored?), disable rcv; NOTE: SREN/CREN overrides TXEN in Sync mode; TXEN + BRGH ignored but set just in case datasheet is wrong
;TODO: use 9-bit xmit for easier 3x encode?
    mov8 BAUD1CON, LITERAL(NOBIT(SCKP) | BIT(BRG16)); idle clock low (data changes on rising edge), 16-bit BRG
    mov16 SP1BRG, LITERAL(MY_BRG(2400 KHz)); 2.66mbps @Fosc 32MHz => 2; use OSCTUNE to slow it down 10% to 2.4mbps
    setbit RC1STA, SPEN, TRUE; enable after config
;    mov8 TX1REG, LITERAL(0); kludge: force TX1IF?
;don't set PIE3.TX1IE or INTCON.PEIE, INTCON.GIE; don't need ints
;    EXPAND_POP
    endm


;wait for space available in WS SPI xmit buf:
#define xmit_ready(yesno)  PIR3, TX1IF, yesno

;wait for xmit buf available:
wait2xmit_if macro want_wait, idler, idler2
    if !BOOL2INT(want_wait); //cuts down on if/endif verbosity in caller; CAUTION: need BOOL2INT here for correct eval
;    messg NO WAIT want_wait #v(want_wait) @1409
	exitm
    endif
;  messg YES WAIT want_wait #v(want_wait) @1412
    wait2xmit idler, idler2
    endm
wait2xmit macro idler, idler2
;    EXPAND_PUSH FALSE
 ;messg wait4frame: idler, idler2, #threads = #v(NUM_THREADS)
;    ifbit xmit_ready(FALSE), idler; bit !ready yet, let other threads run
    idler; assume not ready yet, let other threads run
    ifbit xmit_ready(FALSE), idler2; more efficient than goto $-3 + call
;    EXPAND_POP
    endm


#define RGB_ORDER(n)  RGB_#v(n); (n) % 3); controls byte order (BYTEOF)
#ifdef RGSWAP; set color order
;line too long :( #define RGB_ORDER(n)  (((RGSWAP >> (8 - 4 * (n))) & 0xF) - 1)
    CONSTANT RGB_#v(0) = (((RGSWAP >> 8) & 0xF) - 1);
    CONSTANT RGB_#v(1) = (((RGSWAP >> 4) & 0xF) - 1);
    CONSTANT RGB_#v(2) = (((RGSWAP >> 0) & 0xF) - 1);
    messg [DEBUG] rgb order RGSWAP, R = #v(RGB_ORDER(0)), G = #v(RGB_ORDER(1)), B = #v(RGB_ORDER(2)) @1431
#else; default color order R,G,B (0x123)
; #define RGB_ORDER(n)  ((n) % 3)
    CONSTANT RGB_#v(0) = 0;
    CONSTANT RGB_#v(1) = 1;
    CONSTANT RGB_#v(2) = 2;
#endif


;send 24 bit color code to next WS281X breakout pixel:
;ws_sendpx macro rgb, want_wait, idler
;    LOCAL RGB = rgb ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
;;~ 10 usec/byte synchronous
;    if ISLIT(RGB); constant (optimized)
;	ws_sendbyte LITERAL(RGB >> 16 & 0xFF), want_wait, idler;
;	ws_sendbyte LITERAL(RGB >> 8 & 0xFF), want_wait, idler;
;	ws_sendbyte LITERAL(RGB & 0xFF), want_wait, idler;
;    else; register
;	ws_sendbyte REGHI(rgb), want_wait, idler;
;	ws_sendbyte REGMID(rgb), want_wait, idler;
;	ws_sendbyte REGLO(rgb), want_wait, idler;
;    endif
;    endm
;send next WS pixel (24-bit RGB value):
ws_send_px macro rgb24, wait_first, first_idler, more_idler
; messg HIBYTE(rgb24)
; messg MIDBYTE(rgb24)
; messg LOBYTE(rgb24)
;    LOCAL HI;
;HI = HIBYTE(rgb24); line too long :(
;    LOCAL MID;
;MID = MIDBYTE(rgb24);
;    LOCAL LO;
;LO = LOBYTE(rgb24);
    LOCAL FIRST_BYTE
FIRST_BYTE = BYTEOF(rgb24, RGB_ORDER(0));
    LOCAL MID_BYTE
MID_BYTE = BYTEOF(rgb24, RGB_ORDER(1));
    LOCAL LAST_BYTE
LAST_BYTE = BYTEOF(rgb24, RGB_ORDER(2));
    ws_send_byte FIRST_BYTE, wait_first, first_idler, more_idler; REGHI(rgb24);
    ws_send_byte MID_BYTE, wait_first, first_idler, more_idler; REGMID(rgb24);
    ws_send_byte LAST_BYTE, wait_first, first_idler, more_idler; REGLO(rgb24);
    endm


;send next byte of WS pixel:
;send byte to next WS breakout pixel
;NO-CAUTION: idler must preserve WREG
;CAUTION: in order to avoid overwriting WREG in idler, encoding is done after wait
; this must be done far enough ahead of time to not cause a delay in xmit (~0.5 usec)
;UART has 2 byte FIFO so app can work ahead up to 2 SPI bytes = 2/3 WS byte ~= 6.7 usec
;idler:
;- for single-threaded busy-wait, use first_idler = goto $-1, more_idler = null
;- for multi-threaded, use first_idler = call YIELD, more_idler = goto YIELD_AGAIN
ws_send_byte macro byte, wait_first, first_idler, more_idler
    LOCAL BYTE = byte;
;    wait2xmit TRUE, goto yield_again;
;    mov8 TX1REG, SPI3x_hi; LITERAL(BYTEOF(SPI3x, 0)); TODO: IOR data bits
;    wait2xmit WREG, call yield;
;    mov8 TX1REG, SPI3x_mid; LITERAL(BYTEOF(SPI3x, 1)); TODO: IOR data bits
;    wait2xmit WREG, call yield;
;    mov8 TX1REG, SPI3x_lo; LITERAL(BYTEOF(SPI3x, 2)); TODO: IOR data bits
;each WS bit is sent as 3 SPI bits: (leader high + data actual + trailer low):
;no    ws_encbyte BYTE, 1/3; before wait so it's ready
;    wait2xmit wait_first, idler
;    if wait_first < 0; wait before compute first byte
;        whilebit xmit_ready(FALSE), idler; PIR3, TX1IF, FALSE, idler; max wait ~= ~3.75 usec @2.67MHz
;	ifbit xmit_ready(FALSE), first_idler;
;        ifbit xmit_ready(FALSE), more_idler;
;    messg wait first? wait_first #v(wait_first < 0), #v(wait_first > 0), #v(wait_first <= 0)
    wait2xmit_if wait_first < 0, first_idler, more_idler;
;    endif
;    YIELD SAVE_WREG; assume xmit !ready yet and let other threads run
;    ifbit xmit_ready(FALSE), YIELD_AGAIN; more efficient than goto $-3 + call
    ws_encbyte BYTE, 1/3; after wait to protect WREG, but might cause latency
;    if wait_first > 0; wait after compute first byte; CAUTION: idler must preserve WREG
    wait2xmit_if wait_first > 0, first_idler, more_idler; CAUTION: idler must take >= 2 instr? (for TXIF to settle)
;    endif
    mov8 TX1REG, WREG; start xmit
;no    ws_encbyte BYTE, 2/3; before wait so it's ready
;    wait2xmit TRUE, idler
;    whilebit xmit_ready(FALSE), idler; PIR3, TX1IF, FALSE, idler; max wait ~= ~3.75 usec @2.67MHz
;    YIELD SAVE_WREG; assume xmit !ready yet and let other threads run
;    ifbit xmit_ready(FALSE), YIELD_AGAIN; more efficient than goto $-3 + call
;    ifbit xmit_ready(FALSE), first_idler;
;    ifbit xmit_ready(FALSE), more_idler;
    wait2xmit_if wait_first <= 0, first_idler, more_idler;
    ws_encbyte BYTE, 2/3; after wait to protect WREG, but might cause latency
    wait2xmit_if wait_first > 0, first_idler, more_idler; CAUTION: idler must take >= 2 instr? (for TXIF to settle)
    mov8 TX1REG, WREG; start xmit
;no    ws_encbyte BYTE, 3/3; before wait so it's ready
;    wait2xmit TRUE, idler
;    whilebit xmit_ready(FALSE), idler; PIR3, TX1IF, FALSE, idler; max wait ~= ~3.75 usec @2.67MHz
;    YIELD SAVE_WREG; assume xmit !ready yet and let other threads run
;    ifbit xmit_ready(FALSE), YIELD_AGAIN; more efficient than goto $-3 + call
;    ifbit xmit_ready(FALSE), first_idler;
;    ifbit xmit_ready(FALSE), more_idler;
    wait2xmit_if wait_first <= 0, first_idler, more_idler;
    ws_encbyte BYTE, 3/3; after wait to protect WREG, but might cause latency
    wait2xmit_if wait_first > 0, first_idler, more_idler; CAUTION: idler must take >= 2 instr? (for TXIF to settle)
    mov8 TX1REG, WREG; start xmit
    endm


;SPI3x piece detector:
;1/3, 2/3, 3/3 for SPI3x-encoded piece of byte
;1, 2, 3 for entire byte
;#define SPI3x_detect(piece)  SPI3x_#v(0)piece; kludge: #v() used for token-pasting
;    CONSTANT SPI3x_#v(0)1 = 3*1; SPI3x_detect(1/3) == 1, SPI3x_detect(1) == 3
;    CONSTANT SPI3x_#v(0)2 = 3*2; SPI3x_detect(2/3) == 2, SPI3x_detect(2) == 6
;    CONSTANT SPI3x_#v(0)3 = 3*4; SPI3x_detect(3/3) == 4, SPI3x_detect(3) == 12; CAUTION: avoid "3" conflict for 3/3

;WS bit encoded for SPI 3x:  b'1X01X01X01X01X01X01X01X0'; 1 = leader, X = actual data, 0 = trailer
;    CONSTANT SPI3x = LITERAL(SPI3x_hi(0) << 16 | SPI3x_MID(0) << 8 | SPI3x_lo(0) << 0); b'100100100100100100100100'); 0x924924; each WS bit is sent as 3 SPI bits: (leader high + data actual + trailer low)
;    CONSTANT SPI3x_hi = HIBYTE(SPI3x); first byte of WS pixel
;    CONSTANT SPI3x_mid = MIDBYTE(SPI3x); second byte
;    CONSTANT SPI3x_lo = LOBYTE(SPI3x); third byte
;    messg #v(SPI3x_hi), #v(SPI3x_mid), #v(SPI3x_lo) @1549

#ifdef BRKOUT_BITREV; reverse bit order (byte order is correct)
    messg [INFO] reversing breakout bit order (EUSART sends lsb first) @1552
; #define REVBYTE(n)  (2 - (n)); 0, 1, 2
; #define BRKOUT_BIT(n)  (7 - (n)); 0..7
; #define BRKOUT_BITVAL(n)  (0x80 >> (n))
;use consts to avoid line too long :(
 #define BRKOUT_BYTE(byte)  BRKOUT_BYTE_#v(byte)
generate_brkout_bytes macro
    LOCAL revbyte = 0, revbit, brkout_byte;
    while revbyte < 0x100
brkout_byte = 0
revbit = 0
	while revbit < 8
brkout_byte |= BOOL2INT(revbyte & BIT(revbit)) * REVBIT(revbit);
revbit += 1;
	endw
	CONSTANT BRKOUT_BYTE_#v(revbyte) = #v(brkout_byte);
revbyte += 1
    endw
    endm
    generate_brkout_bytes
; #define SPI3x_FIRST(byte)  (b'00100100' | BOOL2INT((byte) & BIT(0)) << 6 | BOOL2INT((byte) & BIT(1)) << 3 | BOOL2INT((byte) & BIT(2)) << 0); set first 3 WS data bits
; #define SPI3x_MID(byte)  (b'10010010' | BOOL2INT((byte) & BIT(3)) << 5 | BOOL2INT((byte) & BIT(4)) << 2); set next 2 WS data bits
; #define SPI3x_LAST(byte)  (b'01001001' | BOOL2INT((byte) & BIT(5)) << 7 | BOOL2INT((byte) & BIT(6)) << 4 | BOOL2INT((byte) & BIT(7)) << 1); set last 3 WS data bits
; #define SPI3x_bit_#v(7)  b'01000000'; insert first WS data bit
; #define SPI3x_bit_#v(6)  b'00001000'; 2nd WS bit
; #define SPI3x_bit_#v(5)  b'00000001'; 3rd WS bit
; #define SPI3x_bit_#v(4)  b'00100000'; 4th WS bit
; #define SPI3x_bit_#v(3)  b'00000100'; 5th WS bit
; #define SPI3x_bit_#v(2)  b'10000000'; 6th WS bit
; #define SPI3x_bit_#v(1)  b'00010000'; 7th WS bit
; #define SPI3x_bit_#v(0)  b'00000010'; last WS bit
#else; normal order
; #define REVBYTE(n)  (n); 0, 1, 2
; #define BRKOUT_BIT(n)  (n); 0..7
; #define BRKOUT_BITVAL(n)  (1 << (n))
 #define BRKOUT_BYTE(byte)  (byte)
; #define SPI3x_FIRST(byte)  (b'10010010' | BOOL2INT((byte) & BIT(7)) << 6 | BOOL2INT((byte) & BIT(6)) << 3 | BOOL2INT((byte) & BIT(5)) << 0); set first 3 WS data bits
; #define SPI3x_MID(byte)  (b'01001001' | BOOL2INT((byte) & BIT(4)) << 5 | BOOL2INT((byte) & BIT(3)) << 2); set next 2 WS data bits
; #define SPI3x_LAST(byte)  (b'00100100' | BOOL2INT((byte) & BIT(2)) << 7 | BOOL2INT((byte) & BIT(1)) << 4 | BOOL2INT((byte) & BIT(0)) << 1); set last 3 WS data bits
; #define SPI3x_bit_#v(7)  b'01000000'; insert first WS data bit
; #define SPI3x_bit_#v(6)  b'00001000'; 2nd WS bit
; #define SPI3x_bit_#v(5)  b'00000001'; 3rd WS bit
; #define SPI3x_bit_#v(4)  b'00100000'; 4th WS bit
; #define SPI3x_bit_#v(3)  b'00000100'; 5th WS bit
; #define SPI3x_bit_#v(2)  b'10000000'; 6th WS bit
; #define SPI3x_bit_#v(1)  b'00010000'; 7th WS bit
; #define SPI3x_bit_#v(0)  b'00000010'; last WS bit
#endif
;#define SPI3x_FIRST(byte)  (REVBYTE(b'01001001') | BOOL2INT((byte) & BIT(7)) << REVBIT(6) | BOOL2INT((byte) & BIT(6)) << REVBIT(3) | BOOL2INT((byte) & BIT(5)) << REVBIT(0)); set first 3 WS data bits
;#define SPI3x_MID(byte)  (REVBYTE(b'10010010') | BOOL2INT((byte) & BIT(4)) << REVBIT(5) | BOOL2INT((byte) & BIT(3)) << REVBIT(2)); set next 2 WS data bits
;#define SPI3x_LAST(byte)  (REVBYTE(b'00100100') | BOOL2INT((byte) & BIT(2)) << REVBIT(7) | BOOL2INT((byte) & BIT(1)) << REVBIT(4) | BOOL2INT((byte) & BIT(0)) << REVBIT(1)); set last 3 WS data bits
;#define SPI3x_FIRST(byte)  (BRKOUT_BITVAL(7) | BOOL2INT((byte) & BIT(7)) * BRKOUT_BITVAL(6) | BRKOUT_BITVAL(4) | BOOL2INT((byte) & BIT(6)) * BRKOUT_BITVAL(3) | BRKOUT_BITVAL(1) | BOOL2INT((byte) & BIT(5)) * BRKOUT_BITVAL(0); set first 3 WS data bits
;#define SPI3x_MID(byte)  (BRKOUT_BITVAL(6) | BOOL2INT((byte) & BIT(4)) * BRKOUT_BITVAL(5) | BRKOUT_BITVAL(3) | BOOL2INT((byte) & BIT(3)) * BRKOUT_BITVAL(2); set next 2 WS data bits
;#define SPI3x_LAST(byte)  (REVBYTE(b'00100100') | BOOL2INT((byte) & BIT(2)) << REVBIT(7) | BOOL2INT((byte) & BIT(1)) << REVBIT(4) | BOOL2INT((byte) & BIT(0)) << REVBIT(1)); set last 3 WS data bits
  messg TODO: should do byte re-order in here @1606
#define SPI3x_FIRST(byte)  BRKOUT_BYTE(b'10010010' | BOOL2INT((byte) & BIT(7)) << 6 | BOOL2INT((byte) & BIT(6)) << 3 | BOOL2INT((byte) & BIT(5)) << 0); set first 3 WS data bits
#define SPI3x_MID(byte)  BRKOUT_BYTE(b'01001001' | BOOL2INT((byte) & BIT(4)) << 5 | BOOL2INT((byte) & BIT(3)) << 2); set next 2 WS data bits
#define SPI3x_LAST(byte)  BRKOUT_BYTE(b'00100100' | BOOL2INT((byte) & BIT(2)) << 7 | BOOL2INT((byte) & BIT(1)) << 4 | BOOL2INT((byte) & BIT(0)) << 1); set last 3 WS data bits
;byteof aliases:
#define SPI3x_0(byte)  SPI3x_FIRST(byte)
#define SPI3x_1(byte)  SPI3x_MID(byte)
#define SPI3x_2(byte)  SPI3x_LAST(byte)


;encode a ws byte into SPI3x format:
;each WS bit is sent as 3 SPI bits: (leader high + data actual + trailer low)
;which = 1/3 for first (leader) part, 2/3 for second (data) part, and 3/3 for third (trailer) part
    VARIABLE WSENC_TEMP = -1; temp var; -1 == not used
ws_encbyte macro byte, which
;    EXPAND_PUSH FALSE
    LOCAL BYTE = byte;
    LOCAL WHICH = 3 * which; 1, 2, 3; NOTE: don't use () here, need to handle fractions
;    ERRIF(BYTE == WREG, [ERROR] encbyte from WREG !implemented, @1624);
    if byte == WREG
	if WSENC_TEMP == -1
	    nbDCL ws_encbyte_temp,;
	    messg [INFO] allocated extra temp for ws_encbyte @1628;
WSENC_TEMP = ws_encbyte_temp;
	endif
	mov8 WSENC_TEMP, WREG; save WREG to temp
BYTE = WSENC_TEMP;
    endif
    if WHICH == 1
	if ISLIT(BYTE); compile-time
	    MOVLW SPI3x_FIRST(BYTE); b'10010010' | BOOL2INT(BYTE & BIT(7)) << 6 | BOOL2INT(BYTE & BIT(6)) << 3 | BOOL2INT(BYTE & BIT(5)) << 0; set first 3 WS data bits
	else; run-time
;	    if byte == WREG; avoid overwriting bits
;		andlw b'11100000';
;		ifbit BYTE, 5, TRUE, iorlw b'00000001'; 3rd WS bit
;		ifbit BYTE, 6, TRUE, iorlw b'00001000'; 2nd WS bit
;		andlw b'10011111';
;		ifbit BYTE, 7, TRUE, iorlw b'01000000'; insert first WS data bit
;		iorlw b'10010010'; set leading part-bits for first 3 WS data bits
;	    else
	    MOVLW SPI3x_FIRST(0); b'10010010'; set leading part-bits for first 3 WS data bits
	    ifbit BYTE, 7, TRUE, IORLW BRKOUT_BYTE(b'01000000'); insert first WS data bit
	    ifbit BYTE, 6, TRUE, IORLW BRKOUT_BYTE(b'00001000'); 2nd WS bit
	    ifbit BYTE, 5, TRUE, IORLW BRKOUT_BYTE(b'00000001'); 3rd WS bit
;	    endif
	endif
;	EXPAND_POP
	exitm
    endif
    if WHICH == 2
	if ISLIT(BYTE); compile-time
	    MOVLW SPI3x_MID(BYTE); b'01001001' | BOOL2INT(BYTE & BIT(4)) << 5 | BOOL2INT(BYTE & BIT(3)) << 2; set next 2 WS data bits
	else; run-time
;	    if byte == WREG; avoid overwriting bits
;		andlw b'00011000';
;		ifbit BYTE, 4, TRUE, iorlw b'00100000'; 4th WS bit
;		ifbit BYTE, 3, TRUE, iorlw b'00000100'; 5th WS bit
;		andlw b'11100111';
;		iorlw b'01001001'; set leading part-bits for next 3 WS data bits
;	    else
	    MOVLW SPI3x_MID(0); b'01001001'; set leading part-bits for next 3 WS data bits
	    ifbit BYTE, 4, TRUE, IORLW BRKOUT_BYTE(b'00100000'); 4th WS bit
	    ifbit BYTE, 3, TRUE, IORLW BRKOUT_BYTE(b'00000100'); 5th WS bit
;	    endif
	endif
;	EXPAND_POP
	exitm
    endif
    if WHICH == 3
	if ISLIT(BYTE); compile-time
	    MOVLW SPI3x_LAST(BYTE); b'00100100' | BOOL2INT(BYTE & BIT(2)) << 7 | BOOL2INT(BYTE & BIT(1)) << 4 | BOOL2INT(BYTE & BIT(0)) << 1; set last 3 WS data bits
	else; run-time
;	    if byte == WREG; avoid overwriting bits
;		andlw b'00000111';
;		ifbit BYTE, 2, TRUE, iorlw b'10000000'; 6th WS bit
;		ifbit BYTE, 1, TRUE, iorlw b'00010000'; 7th WS bit
;		andlw b'11111001';
;		ifbit BYTE, 0, TRUE, iorlw b'00000010'; last WS bit
;		andlw b'11111110';
;		iorlw b'00100100'; set leading part-bits for last 2 WS data bits
;	    else
	    MOVLW SPI3x_LAST(0); b'00100100'; set leading part-bits for last 2 WS data bits
	    ifbit BYTE, 2, TRUE, IORLW BRKOUT_BYTE(b'10000000'); 6th WS bit
	    ifbit BYTE, 1, TRUE, IORLW BRKOUT_BYTE(b'00010000'); 7th WS bit
	    ifbit BYTE, 0, TRUE, IORLW BRKOUT_BYTE(b'00000010'); last WS bit
;	    endif
	endif
;	EXPAND_POP
	exitm
    endif
    error [ERROR] unknown ws "byte" part: which ==> #v(WHICH) @1696
;    EXPAND_POP
    endm


;; FPS tracking ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;    nbDCL FPS,; breakout value (used as counter until breakout is refreshed)
;    nbDCL numfr,; internal counter


    VARIABLE CURRENT_FPS_usec = -1;
WAIT macro duration_usec
    if duration_usec != CURRENT_FPS_usec
        fps_init duration_usec;
	NOP 2; give T0IF time to settle?
    endif
    wait4frame ORG$, goto $-1; //busy wait; use YIELD for multi-tasking
    endm


;set up recurring frames:
;uses Timer 0 rollover as recurring 1 sec elapsed timer
;also used for frame timer during power-on breakout animation
;nope-uses NCO for 1 sec interval; other timers are busy :(
;#define NICKS_FOSC  b'0000'; should be in p16f15313.inc
;#define NCO_ROLLOVER  FOSC_FREQ
;#define wait4_1sec  ifbit PIR7, NCO1IF, FALSE, goto $-1
;#define T2SRC_FOSC  b'0010'; run Timer2 at same speed as Fosc (16 MHz)
;    VARIABLE T0_WAITCOUNT = 0; generate unique labels; also remembers init
;    CONSTANT MAX_ACCURACY = 1 << 20; 1 MHz; max accuracy to give caller; use nop for < 1 usec delays
#define T0SRC_FOSC4  b'010'; FOSC / 4; should be in p16f15313.inc
#define T0_prescaler(freq)  prescaler(FOSC_FREQ/4, freq); log2(FOSC_FREQ / 4 / (freq)); (1 MHz)); set pre-scalar for 1 usec ticks
;#define T0_prescfreq(prescaler)  (FOSC_FREQ / 4 / BIT(prescaler)); (1 MHz)); set pre-scalar for 1 usec ticks
;    messg ^^ REINSTATE @1719
;#define T0_postscaler  log2(1); 1-to-1 post-scalar
;#define T0_ROLLOVER  50; 50 ticks @1 usec = 50 usec; WS281X latch time = 50 usec
;    messg [DEBUG] T0 prescaler = #v(T0_prescale), should be 2 (1:4) @1722
;#define MY_T0CON1(tick_freq)  (T0SRC_FOSC4 << T0CS0 | NOBIT(T0ASYNC) | T0_prescaler(tick_freq) << T0CKPS0); FOSC / 4, sync, pre-scalar TBD (1:1 for now)
;#define SETUP_NOWAIT  ORG $-1; idler to use for no-wait, setup only
;#define wait4_t1tick  ifbit PIR5, TMR1GIF, FALSE, goto $-1; wait acq
#define elapsed_fps  PIR0, TMR0IF
    CONSTANT MAX_T0PRESCALER = log2(32768), MAX_T0POSTSC = log2(16);
fps_init macro interval_usec;, enable_ints; wait_usec macro delay_usec, idler
;    EXPAND_PUSH FALSE
CURRENT_FPS_usec = interval_usec; remember last setting; TODO: add to SAVE_CONTEXT
;TODO: don't use TUNED() unless OSCTUNE is adjusted (ws_breakout_setup)
    LOCAL USEC = TUNED(interval_usec); CAUTION: compensate for OSCTUNE (set by ws_breakout_setup)
;    mov8 NCO1CON, LITERAL(NOBIT(N1EN) | NOBIT(N1POL) | NOBIT(N1PFM)); NCO disable during config, active high, fixed duty mode
;    mov8 NCO1CLK, LITERAL(N1CKS_FOSC << N1CKS0); pulse width !used
;    mov24 NCO1INC, LITERAL(1)
;    setbit INTCON, GIE, FALSE; disable interrupts (in case waiting for 50 usec WS latch signal)
;    if usec == 1
;    movlw ~(b'1111' << T0CKPS0) & 0xFF; prescaler bits
;    BANKCHK T0CON1
;    andwf T0CON1, F; strip previous prescaler
;    MESSG fps_init delay_usec @1739;
;    if !WAIT_COUNT; first time init
;        mov8 T0CON0, LITERAL(NOBIT(T0EN) | NOBIT(T016BIT) | T0_postscaler << T0OUTPS0); Timer 0 disabled during config, 8 bit mode, 1:1 post-scalar
;    else
;        setbit T0CON0, T0EN, FALSE;
;    endif
;    LOCAL ACCURACY = MAX_ACCURACY; 1 MHz; max accuracy to give caller; use nop for < 1 usec delays
    LOCAL PRESCALER = 3, POSTSCALER; not < 1 usec needed (8 MIPS @1:8)
    LOCAL T0tick, LIMIT, ROLLOVER;
;    LOCAL FREQ_FIXUP; = FOSC_FREQ / 4 / BIT(PRESCALER);
;    while ACCURACY >= 1 << 7; 125 Hz
    messg [TODO] change this to use postscaler 1..16 instead of just powers of 2 (for more accuracy) @1750
    while PRESCALER <= MAX_T0PRESCALER + MAX_T0POSTSC; use smallest prescaler for best accuracy
;T0FREQ = FOSC_FREQ / 4 / BIT(PRESCALER); T0_prescfreq(PRESCALER);
T0tick = scale(FOSC_FREQ/4, PRESCALER); BIT(PRESCALER) KHz / (FOSC_FREQ / (4 KHz)); split 1M factor to avoid arith overflow; BIT(PRESCALER - 3); usec
;presc 1<<3, freq 1 MHz, period 1 usec, max delay 256 * usec
;presc 1<<5, freq 250 KHz, period 4 usec, max delay 256 * 4 usec ~= 1 msec
;presc 1<<8, freq 31250 Hz, period 32 usec, max delay 256 * 32 usec ~= 8 msec
;presc 1<<13, freq 976.6 Hz, period 1.024 msec, max delay 256 * 1.024 msec ~= .25 sec
;presc 1<<15, freq 244.1 Hz, period 4.096 msec, max delay 256 * 4.096 msec ~= 1 sec
LIMIT = 256 * T0tick; (1 MHz / T0FREQ); BIT(PRESCALER - 3); 32 MHz / (FOSC_FREQ / 4); MAX_ACCURACY / ACCURACY
;	messg [DEBUG] wait #v(interval_usec) usec: prescaler #v(PRESCALER) => limit #v(LIMIT) @1760
;        messg tick #v(T0tick), presc #v(PRESCALER), max delay #v(LIMIT) usec @1761
	if USEC <= LIMIT; ) || (PRESCALER == MAX_T0PRESCALER); this prescaler allows interval to be reached
POSTSCALER = MAX(PRESCALER - MAX_T0PRESCALER, 0); line too long :(
PRESCALER = MIN(PRESCALER, MAX_T0PRESCALER);
ROLLOVER = rdiv(USEC, T0tick); 1 MHz / T0FREQ); / BIT(PRESCALER - 3)
	    messg [DEBUG] fps_init #v(interval_usec) (#v(USEC) tuned) "usec": "prescaler" #v(PRESCALER)+#v(POSTSCALER), max intv #v(LIMIT), actual #v(ROLLOVER * T0tick), rollover #v(ROLLOVER) @1766
;    messg log 2: #v(FOSC_FREQ / 4) / #v(FOSC_FREQ / 4 / BIT(PRESCALER)) = #v(FOSC_FREQ / 4 / (FOSC_FREQ / 4 / BIT(PRESCALER))) @1767; (1 MHz)); set pre-scalar for 1 usec ticks
;FREQ_FIXUP = MAX(1 MHz / T0tick, 1); T0FREQ;
;	    if T0FREQ * BIT(PRESCALER) != FOSC_FREQ / 4; account for rounding errors
;	    if T0tick * FREQ_FIXUP != 1 MHz; account for rounding errors
;	        messg freq fixup: equate #v(FOSC_FREQ / 4 / MAX(FREQ_FIXUP, 1)) to #v(BIT(PRESCALER)) for t0freq #v(FREQ_FIXUP) fixup @1771
;		CONSTANT log2(FOSC_FREQ/4 / FREQ_FIXUP) = PRESCALER; kludge: apply prescaler to effective freq
;	    endif
	    mov8 T0CON0, LITERAL(NOBIT(T0EN) | NOBIT(T016BIT) | POSTSCALER << T0OUTPS0); Timer 0 disabled during config, 8 bit mode, 1:1 post-scalar
	    mov8 T0CON1, LITERAL(T0SRC_FOSC4 << T0CS0 | NOBIT(T0ASYNC) | PRESCALER << T0CKPS0); FOSC / 4, sync, pre-scalar
	    mov8 TMR0L, LITERAL(0); restart count-down with new limit
	    mov8 TMR0H, LITERAL(ROLLOVER - 1); (usec) / (MAX_ACCURACY / ACCURACY) - 1);
	    setbit T0CON0, T0EN, TRUE;
	    setbit elapsed_fps, FALSE; clear previous interrupt
;	    if !WAIT_COUNT ;first time init
;	    if enable_ints
;	        setbit PIE0, TMR0IE, TRUE; no, just polled
;	    endif
;wait_loop#v(WAIT_COUNT):
;WAIT_COUNT += 1
;	    idler;
;	    if $ < wait_loop#v(WAIT_COUNT - 1); reg setup only; caller doesn't want to wait
;		ORG wait_loop#v(WAIT_COUNT - 1)
;		exitm
;	    endif
;assume idler handles BSR + WREG tracking; not needed:
;	    if $ > wait_loop#v(WAIT_COUNT - 1)
;		DROP_CONTEXT; TODO: idler hints; for now assume idler changed BSR or WREG
;	    endif
;	    ifbit elapsed_fps, FALSE, goto wait_loop#v(WAIT_COUNT - 1); wait for timer roll-over
;	    wait4_t1roll; wait for timer roll-over
;ACCURACY = 1 KHz; break out of loop	    exitwhile
;    if usec >= 256
;	movlw ~(b'1111' << T0CKPS0) & 0xFF; prescaler bits
;	BANKCHK T0CON1
;	andwf T0CON1, F; strip temp prescaler
;	iorwf T0CON1, T0_prescale << T0CKPS0; restore original 8:1 pre-scalar used for WS input timeout
;    endif
;    mov8 TMR0H, LITERAL(T0_ROLLOVER); restoreint takes 1 extra tick but this accounts for a few instr at start of ISR
	    exitm
	endif
PRESCALER += 1
;FREQ_FIXUP = IIF(FREQ_FIXUP == 31250, 16000, FREQ_FIXUP / 2);
    endw
;    error [ERROR] "fps_init" #v(interval_usec) "usec" (#v(USEC) tuned) unreachable with max "prescaler" #v(MAX_T0PRESCALER), using max interval #v(UNTUNED(LIMIT)) "usec" (#v(LIMIT) tuned) @1810)
    ERRIF(TRUE, [ERROR] "fps_init" #v(interval_usec) "usec" (#v(USEC) tuned) exceeds max reachable interval #v(UNTUNED(LIMIT)) "usec" (#v(LIMIT) tuned) @1811)
;    if usec <= 256
;;	iorwf T0CON1, T0_prescale << T0CKPS0; restore original 8:1 pre-scalar used for WS input timeout
;        mov8 T0CON1, LITERAL(MY_T0CON1(1 MHz));
;        mov8 TMR0H, LITERAL(usec - 1);
;    else
;	if usec <= 1 M; 1 sec
;            mov8 T0CON1, LITERAL(MY_T0CON1(250 Hz));
;	    mov8 TMR0H, LITERAL((usec) / (1 KHz) - 1);
;	else
;	    if usec <= 256 K
;		mov8 T0CON1, LITERAL(MY_T0CON1(1 KHz));
;		mov8 TMR0H, LITERAL((usec) / (1 KHz) - 1);
;	    else
;	    endif
;	endif
;    endif
;    EXPAND_POP
    endm
;    mov8 T0CON0, LITERAL(NOBIT(T0EN) | NOBIT(T016BIT) | T0_postscale << T0OUTPS0); Timer 0 disabled during config, 8 bit mode, 1:1 post-scalar
;;    mov8 T0CON1, LITERAL(MY_T0CON1(MAX(FREQ_FIXUP, 1))); FREQ_FIXUP)); FOSC_FREQ / 4 / BIT(PRESCALER)));
;    mov8 T0CON1, LITERAL(T0SRC_FOSC4 << T0CS0 | NOBIT(T0ASYNC) | MAX_T0PRESCALER << T0CKPS0); FOSC / 4, sync, pre-scalar TBD (1:1 for now)
;    mov8 TMR0L, LITERAL(0); restart count-down with new limit
;    mov8 TMR0H, LITERAL(ROLLOVER - 1); (usec) / (MAX_ACCURACY / ACCURACY) - 1);
;    setbit T0CON0, T0EN, TRUE;
;    setbit elapsed_fps, FALSE; clear previous overflow
;init app counters:
;    mov8 FPS, LITERAL(0)
;    mov8 numfr, LITERAL(0)
;    endm


;wait for new frame:
wait4frame macro idler, idler2
;    EXPAND_PUSH FALSE
; messg wait4frame: idler, idler2, #threads = #v(NUM_THREADS)
;    ifbit elapsed_fps, FALSE, idler; bit !ready yet, let other threads run
    idler; assume not ready yet, let other threads run
    ifbit elapsed_fps, FALSE, idler2; more efficient than goto $-3 + call
    setbit elapsed_fps, FALSE;
;    EXPAND_POP
    endm

    EXPAND_POP
    LIST_POP
    messg end of hoist 3 @1856
;#else; too deep :(
#endif
#if HOIST == 2
    messg hoist 2: cooperative multi-tasking ukernel @1860
    LIST_PUSH FALSE; don't show this section in .LST file
    EXPAND_PUSH FALSE
;; cooperative multi-tasking ukernel ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#define HOST_STKLEN  16-0; total stack space available to threads; none left for host, threaded mode is one-way xition
#define RERUN_THREADS  TRUE; true/false to re-run thread after return (uses 1 extra stack level); comment out ONLY if threads NEVER return!


;NOTE: current (yield) addr uses 1 stack level
#ifndef RERUN_THREADS
 #define MIN_STACK  1; need 1 level for current exec addr within thread
#else
 #define MIN_STACK  2; need another level in case thread returns to wrapper
#endif


;encapsulate "call" vs "goto" for caller:
;#define YIELD  call yield
;#define YIELD_AGAIN  goto yield_again

;dummy target until threads defined:
;no_treads equ $; kludge: must be const rather than label for "yield" aliasing
;yield_none: sleep
;yield set yield_none
;yield_again set yield_none
;stkptr_#v(0) SET STKPTR; dummy def if no threads defined; threads will redefine
;!worky #define YIELD  yield_generic
;use generic versions outside of thread def:
;YIELD set yield
;YIELD_AGAIN set yield_again


;    nbDCL stkptr_2,
;    messg TODO: ^^^ fix this @1894
;define new thread:
;starts executing when yield is called
    VARIABLE STK_ALLOC = 0; total stack alloc to threads
    VARIABLE NUM_THREADS = 0;
    VARIABLE IN_THREAD = 0;
THREAD_DEF macro thread_body, stacksize
;    EXPAND_PUSH FALSE;
    ERRIF(IN_THREAD, [ERROR] missing END_THREAD from previous thread #v(NUM_THREADS - 1) @1902);
;    END_THREAD; #undef aliases for prev thread
    ERRIF(stacksize < MIN_STACK, [ERROR] thread_body stack size #v(stacksize)"," needs to be >= #v(MIN_STACK) @1904);
    ERRIF(stacksize > HOST_STKLEN - STK_ALLOC, [ERROR] thread_body stack size #v(stacksize) exceeds available #v(HOST_STKLEN - STK_ALLOC)"," thread cannot be created @1905)
;    ERRIF((NUM_THREADS << 4) & ~0x7F, [ERROR] too many threads already: #v(NUM_THREADS), PCLATH !enough bits @1906); stack is only 15 bits wide
;    LOCAL thread_body;
;statically assign resources to threads:
;gives more efficient code and handles yields to unstarted threads
;threads are assumed to run forever so resources are never deallocated
    nbDCL stkptr_#v(NUM_THREADS),; each thread gets its own section of stack space + saved STKPTR
STK_ALLOC += stacksize
    messg creating thread_body thread# #v(NUM_THREADS) @#v($), stack size #v(stacksize), host stack remaining: #v(HOST_STKLEN - STK_ALLOC) @1913
;stkptr_#v(0) SET stkptr_#v(NUM_THREADS + 1); wrap-around for round robin yield; NOTE: latest thread overwrites this
;cooperative multi-tasking:
;6-instr context switch: 3 now (call + sv STKPTR) + 3 later (rest STKPTR + return)
;    if NUM_THREADS > 0; one back to avoid undefs
;#undefine YIELD
;#define YIELD  call yield_from_#v(NUM_THREADS); alias for caller
;YIELD set yield_from_#v(NUM_THREADS); alias for caller
;#define yield  yield_from_#v(NUM_THREADS); alias for caller
#if 0
yield_from_#v(NUM_THREADS): DROP_CONTEXT; overhead for first yield = 10 instr = 1.25 usec @8 MIPS
    mov8 stkptr_#v(NUM_THREADS), STKPTR; #v(curthread)
;yield_from_#v(NUM_THREADS)_placeholder set $
yield_again_#v(NUM_THREADS): DROP_CONTEXT; overhead for repeating yield = 7 instr < 1 usec @8 MIPS
    CONTEXT_SAVE yield_placeholder_#v(NUM_THREADS)
    ORG $ + 2+1; placeholder for: mov8 STKPTR, stkptr_#v(NUM_THREADS + 1); % MAX_THREADS); #v(curthread + 1); round robin
    EMIT return;
;yield set yield_from_#v(NUM_THREADS); alias for caller
;#define YIELD  CALL yield
;yield_again set yield_again_#v(NUM_THREADS); alias for caller
;#define YIELD_AGAIN  GOTO yield_again
#endif
;yield_from_#v(thread_body) EQU yield_from_#v(NUM_THREADS); allow yield by thread name
;#define YIELD_AGAIN  goto yield_again_#v(NUM_THREADS); alias for caller
;YIELD_AGAIN set yield_again_#v(NUM_THREADS); alias for caller
;#define yield_again  yield_again_#v(NUM_THREADS); alias for caller
;yield_again_#v(NUM_THREADS): DROP_CONTEXT;
;    BANKCHK STKPTR;
;    BANKSAFE dest_arg(W) incf STKPTR;, W; ret addr !change: replaces goto + call, saves 3 instr
;    BANKSAFE dest_arg(F) incf stkptr_#v(NUM_THREADS);, F;
;no! already correct    INCF stkptr_#v(NUM_THREADS), F;
;yield_again_#v(NUM_THREADS)_placeholder set $
;    CONTEXT_SAVE yield_again_placeholder_#v(NUM_THREADS)
;    ORG $ + 2+1; placeholder for: mov8 STKPTR, stkptr_#v(NUM_THREADS + 1); % MAX_THREADS); #v(curthread + 1); round robin
;    EMIT return;
;yield_again set yield_again_#v(NUM_THREADS); alias for caller
;#define YIELD_AGAIN  GOTO yield_again
;yield SET yield_from_#v(NUM_THREADS); alias for caller
;yield_again SET yield_again_#v(NUM_THREADS); alias for caller
;thread_body: DROP_CONTEXT;
;start_thread_#v(0) EQU yield
;define thread entry point:
#define YIELD  CALL yield
#define YIELD_AGAIN  GOTO yield_again
yield set yield_from_#v(NUM_THREADS); alias for caller
yield_again set yield_again_#v(NUM_THREADS); alias for caller
    doing_init TRUE;
#ifdef RERUN_THREADS
;    CALL (NUM_THREADS << (4+8)) | thread_wrapper_#v(NUM_THREADS)); set active thread# + statup addr
    CALL stack_alloc_#v(NUM_THREADS); kludge: put thread_wrapper ret addr onto stack; NOTE: doesn't return until yield-back
;thread_wrapper_#v(NUM_THREADS): DROP_CONTEXT;
;    LOCAL rerun_thr;
;rerun_thr:
    CALL thread_body; start executing thread; allows thread to return but uses extra stack level
#if !RERUN_THREADS
    YIELD; call yield_from_#v(NUM_THREADS) ;bypass dead (returned) threads in round robin yields
#endif
;    GOTO IIF(RERUN_THREADS, rerun_thr, yield_again); $-1; re-run thread or just yield to other threads
    YIELD_AGAIN; stack_alloc does same thing as yield_from
#else
;    error [TODO] put "CALL stack_alloc" < "thread_body" @1967
;thread_wrapper_#v(NUM_THREADS) EQU thread_body; onthread(NUM_THREADS, thread_body); begin executing thread; doesn't use any stack but thread can never return!
;    goto thread_body; begin executing thread; doesn't use any stack but thread can never return!
    PUSH thread_body;
;    GOTO stack_alloc_#v(NUM_THREADS); kludge: put thread_wrapper ret addr onto stack; doesn't return until yield
#endif
#if 1
yield_from_#v(NUM_THREADS): DROP_CONTEXT; overhead for first yield = 10 instr = 1.25 usec @8 MIPS
    mov8 stkptr_#v(NUM_THREADS), STKPTR; #v(curthread)
;yield_from_#v(NUM_THREADS)_placeholder set $
yield_again_#v(NUM_THREADS): DROP_CONTEXT; overhead for repeating yield = 7 instr < 1 usec @8 MIPS
    CONTEXT_SAVE yield_placeholder_#v(NUM_THREADS)
    ORG $ + 2+1; placeholder for: mov8 STKPTR, stkptr_#v(NUM_THREADS + 1); % MAX_THREADS); #v(curthread + 1); round robin
    EMIT return;
;yield set yield_from_#v(NUM_THREADS); alias for caller
;yield_again set yield_again_#v(NUM_THREADS); alias for caller
#endif
;alloc + stack + set initial addr:
;NOTE: thread doesn't start execeuting until all threads are defined (to allow yield to auto-start threads)
;CAUTION: execution is multi-threaded after this; host stack is taken over by threads; host stack depth !matter because will never return to single-threaded mode
;create_thread_#v(NUM_THREADS): DROP_CONTEXT;
;create thread but allow more init:
;    doing_init TRUE;
;    EMIT goto init_#v(INIT_COUNT + 1); daisy chain: create next thread; CAUTION: use goto - change STKPTR here
;    mov8 PCLATH, LITERAL(NUM_THREADS << 4); set active thread#; will be saved/restored by yield
;    movlp NUM_THREADS << 4; set active thread#; will be saved/restored by yield_#v(); used by generic yield() to select active thread
;    movlw 0x0F
;    andwf PCLATH, F; drop current thread#, preserve current code page bits
;    movlw #v(NUM_THREADS) << 4;
;    iorwf PCLATH, F; set new thread#
;    setbit PCLATH, 12-8, NUM_THREADS & BIT(0);
;    mov16 TOS, LITERAL(NUM_THREADS << (4+8) | thread_wrapper_#v(NUM_THREADS)); thread statup addr
;kludge: put thread# in PCH msb; each thread runs on its own code page, but code can be shared between threads with virtual auto-thunks
;    PUSH LITERAL(NUM_THREADS << (4+8) | thread_wrapper_#v(NUM_THREADS)); set active thread# + statup addr
stack_alloc_#v(NUM_THREADS): DROP_CONTEXT; CAUTION: this function delays return until yield-back
    mov8 stkptr_#v(NUM_THREADS), STKPTR;
;    REPEAT LITERAL(stacksize), PUSH thread_exec_#v(NUM_THREADS);
;    mov16 TOS, LITERAL(NUM_THREADS << 12 | thread_body); start_#v(NUM_THREADS)); set initial execution point in case another thread yields before this thread starts; thread exec could be delayed by using yield_#v() here
;    BANKCHK STKPTR;
    if (stacksize) <= 3
;	BANKSAFE dest_arg(F) incf STKPTR;, F;
;	INCF STKPTR, F;
        REPEAT LITERAL(stacksize - 1), dest_arg(F) INCF STKPTR; alloc requested space (1 level used by thread wrapper)
    else
        MOVLW stacksize - 1; stack level used for initial addr
;	BANKSAFE dest_arg(F) addwf STKPTR;, F; alloc stack space to thread
	ADDWF STKPTR, F; alloc stack space to thread
    endif
;    goto create_thread_#v(NUM_THREADS - 1); daisy-chain: create previous thread; CAUTION: use goto - don't want to change STKPTR here!
;  messg [DEBUG] #v(BANK_TRACKER) @2005
    doing_init FALSE;
;    messg "YIELD = " YIELD @2007
NUM_THREADS += 1; do this at start so it will remain validate within thread body; use non-0 for easier PCLATH debug; "thread 0" == prior to thread xition
;    messg "YIELD = " YIELD @2009
IN_THREAD = NUM_THREADS;
;    EXPAND_POP
    endm

THREAD_END macro
;    EXPAND_PUSH FALSE
    ERRIF(!IN_THREAD, [ERROR] no thread"," last used was #v(NUM_THREADS) @2016);
IN_THREAD = FALSE;
;use generic versions outside of thread def:
;YIELD set yield
;YIELD_AGAIN set yield_again
;#undefine yield
;#undefine yield_again
;yield set yield_generic
;yield_again set yield_again_generic
#undefine YIELD
#undefine YIELD_AGAIN
;    EXPAND_POP
    endm


;in-lined YIELD_AGAIN:
;occupies 2-3 words in prog space but avoids extra "goto" (2 instr cycles) on context changes at run time
;CAUTION: returns to previous YIELD, not code following
YIELD_AGAIN_inlined macro
    mov8 STKPTR, stkptr_#v(NUM_THREADS); round robin
    EMIT return; return early if banksel !needed; more efficient than nop
    endm

;create + execute threads:
;once threads are created, execution jumps to ukernel (via first thread) and never returns
;cre_threads macro
;init_#v(INIT_COUNT): DROP_CONTEXT; macro
;first set up thread stacks + exec addr:
;    LOCAL thr = #v(NUM_THREADS);
;    while thr > 0
;	call create_thread_#v(thr); NOTE: stack alloc + set initial addr; thread doesn't start until yielded to
;thr -= 1
;    endw
;    call create_thread_#v(NUM_THREADS); create all threads (daisy chained)
;    WARNIF(!NUM_THREADS, [ERROR] no threads to create, going to sleep @2050);
;    sleep
;start executing first thread; other threads will start as yielded to
;CAUTION: never returns
;create_thread_#v(0): DROP_CONTEXT;
;    mov8 STKPTR, stkptr_#v(NUM_THREADS); % MAX_THREADS); #v(curthread + 1); round robin
;    return;
;    ENDM
;INIT_COUNT = -1; += 999; no more init code after multi-threaded ukernel starts
    

;resume_thread macro thrnum
;    mov8 STKPTR, stkptr_#v(thrnum); % MAX_THREADS); #v(curthread + 1); round robin
;    return;
;    endm
    
;yield_until macro reg, bitnum, bitval
;    ifbit reg, bitnum, bitval, resume_thread
;    mov8 stkptr_#v(NUM_THREADS), STKPTR; #v(curthread)
;    mov8 STKPTR, stkptr_#v(NUM_THREADS + 1); % MAX_THREADS); #v(curthread + 1); round robin
;    endm

;yield_delay macro usec_delay
;    endm

; messg EOF_COUNT @__LINE__
eof_#v(EOF_COUNT) macro
;    EXPAND_PUSH FALSE
;    messg [INFO] #threads: #v(NUM_THREADS), stack space needed: #v(STK_ALLOC), unalloc: #v(HOST_STKLEN - STK_ALLOC) @2078
;optimize special cases:
;    if NUM_THREADS == 1
;	messg TODO: bypass yield (only 1 thread) @2081
;    endif
;    if NUM_THREADS == 2
;	messg TODO: swap stkptr_#v() (only 2 threads) @2084
;    endif
;start executing first thread; other threads will start as yielded to
;CAUTION: never returns
    if NUM_THREADS
        messg [INFO] #threads: #v(NUM_THREADS), stack alloc: #v(STK_ALLOC)/#v(HOST_STKLEN) (#v(pct(STK_ALLOC, HOST_STKLEN))%) @2089
stkptr_#v(NUM_THREADS) EQU stkptr_#v(0); wrap-around for round robin yield
;stkptr_#v(NUM_THREADS) SET stkptr_#v(0); wrap-around for round robin yield; NOTE: latest thread overwrites this
;	EMITL start_threads:; only used for debug
;	mov8 STKPTR, stkptr_#v(NUM_THREADS); % MAX_THREADS); #v(curthread + 1); round robin
;	EMIT return;
  messg [DEBUG] why is banksel needed here? #v(BANK_TRACKER) @2095
	YIELD_AGAIN_inlined; start first thread
    endif
;unneeded? generic yield:
;allows code sharing between threads, but adds extra run-time overhead (6 instr cycle per yield)
;caller can also use yield_from_#v() directly if target thread is constant (reduces overhead)
;    nbDCL curthread,; need to track which thread is executing
;kludge: use 4 msb of PCH to track which thread is running; 4 lsb can be involved with addressing
;CAUTION: this requires *all* shared and thread-specific code to run in a separate code page
; this allows code to be shared between threads but only works when code addresses wrap to existing prog space
;    EMITL yield_generic: DROP_CONTEXT;
;    BANKCHK TOSH;
;    BANKSAFE dest_arg(W) swapf TOSH;, W; PCLATH might have changed, TOSH gives true PC
;    EMIT andlw 0x0F; strip off 4 lsb (swapped), leaving thread#; NOTE: PC is 15 bits so only 8 thread pages are possible
;    EMIT brw
    LOCAL yield_thread = 0, here
;    LOCAL save_place = $, save_wreg = WREG_TRACKER, save_bank = BANK_TRACKER
    CONTEXT_SAVE before_yield
    while yield_thread < NUM_THREADS
;	EMIT goto yield_from_#v(yield_thread); NOTE: 4 msb PCLATH will be set within yield_#v()
;go back and fill in placeholders now that we know which thread# will wrap back to 0:
;save_place = $
;BANK_TRACKER = STKPTR; BSR was set < placeholder
;	DROP_WREG;
;	ORG yield_from_#v(yield_thread)_placeholder
        CONTEXT_RESTORE yield_placeholder_#v(yield_thread)
here = $	
	mov8 STKPTR, stkptr_#v(yield_thread + 1); (yield_thread + 1) % NUM_THREADS); round robin wraps around
	if $ < here + 2+1
	    EMIT return; return early if banksel !needed; more efficient than nop
	endif
;	DROP_WREG;
;	ORG yield_again_#v(yield_thread)_placeholder
;        CONTEXT_RESTORE yield_again_placeholder_#v(yield_thread)
;here = $	
;	mov8 STKPTR, stkptr_#v((yield_thread + 1) % NUM_THREADS); round robin wraps around
;	if $ < here + 3
;	    EMIT return; fill space reserve for banksel; return rather than nop
;	endif
;	ORG save_place
yield_thread += 1
    endw
;    ORG save_place
;WREG_TRACKER = save_wreg
;BANK_TRACKER = save_bank
    CONTEXT_RESTORE before_yield
;    while yield_thread < 16
;	EMIT sleep; pad out jump table in case of unknown thread
;yield_thread += 1
;    endw
;generic yield_again:
;    EMITL yield_again_generic: DROP_CONTEXT;
;    BANKCHK TOSH;
;    BANKSAFE dest_arg(W) swapf TOSH;, W; PCLATH might have changed, TOSH gives true PC
;    EMIT andlw 0x0F; strip off 4 lsb (swapped), leaving thread#; NOTE: PC is 15 bits so only 8 thread pages are possible
;    EMIT brw
;    while yield_thread < 16 + NUM_THREADS
;	EMIT goto yield_again_#v(yield_thread % NUM_THREADS); NOTE: 4 msb PCLATH will be set within yield_#v()
;yield_thread += 1
;    endw
;    while yield_thread < 16 + 16
;	EMIT sleep; pad out jump table in case of unknown thread
;yield_thread += 1
;    endw
;    EXPAND_POP
    endm
EOF_COUNT += 1;


;; config/init ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;peripherals used as follows:
;- Timer 0 generates interrupt for next frame after 50 usec WS idle time or for animation (while interrupts off)
;- Timer 1 gate mode measures WS input pulse width for decoding first WS input pixel or just counting ws bytes thereafter
;- Timer 2 used as elapsed time for FPS tracking
;- EUSART used to generate WS breakout stream
;- CLC1-3 redirects WS input to other pins (segments)


;disable unused peripherals:
;saves a little power, helps prevent accidental interactions
#define ENABLED(n)  NOBIT(n); all peripherals are ON by default
#define DISABLED(n)  BIT(n)
#define ENABLED_ALL  0
#define DISABLED_ALL  0xFF
pmd_init macro
;?    mov8 ODCONA, LITERAL(0); //all push-pull out (default), no open drain
;?    mov8 SLRCONA, LITERAL(~BIT(RA3)); //0x37); //limit slew rate, all output pins 25 ns vs 5 ns
;?    mov8 INLVLA, LITERAL(~BIT(RA3)); //0x3F); //TTL input levels on all input pins
;??    mov8 RA4PPS, LITERAL(0x01);   ;RA4->CLC1:CLC1OUT;    
;??    mov8 RA5PPS, LITERAL(0x01);   ;RA5->CLC1:CLC1OUT;    
;??    mov8 RA1PPS, LITERAL(0x01);   ;RA1->CLC1:CLC1OUT;    
;??    mov8 RA2PPS, LITERAL(0x01);   ;RA2->CLC1:CLC1OUT;    
;??    mov8 RA0PPS, LITERAL(0x16);   ;RA0->MSSP1:SDO1;    
;    setbit PMD0, FVRMD, DISABLED;
;    setbit PMD0, NVMMD, DISABLED;
;    setbit PMD0, CLKRMD, DISABLED;
;    setbit PMD0, IOCMD, DISABLED;
    mov8 PMD0, LITERAL(DISABLED_ALL ^ DISABLED(SYSCMD)); ENABLED(SYSCMD) | DISABLED(FVRMD) | DISABLED(NVMMD) | DISABLED(CLKRMD) | DISABLED(IOCMD)); keep sys clock, disable FVR, NVM, CLKR, IOC
;    setbit PMD1, NCOMD, DISABLED;
    mov8 PMD1, LITERAL(DISABLED_ALL ^ DISABLED(TMR2MD) ^ DISABLED(TMR1MD) ^ DISABLED(TMR0MD)); DISABLED(NCOMD) | ENABLED(TMR2MD) | ENABLED(TMR1MD) | ENABLED(TMR0MD)); disable NCO, enabled Timer 0 - 2
;    setbit PMD2, DAC1MD, DISABLED;
;    setbit PMD2, ADCMD, DISABLED;
;    setbit PMD2, CMP1MD, DISABLED;
;    setbit PMD2, ZCDMD, DISABLED;
    mov8 PMD2, LITERAL(DISABLED_ALL); DISABLED(DAC1MD) | DISABLED(ADCMD) | DISABLED(CMP1MD) | DISABLED(ZCDMD)); disable DAC1, ADC, CMP1, ZCD
;    setbit PMD3, PWM6MD, DISABLED;
;    setbit PMD3, PWM5MD, DISABLED;
;    setbit PMD3, PWM4MD, DISABLED;
;    setbit PMD3, CCP2MD, DISABLED;
;    setbit PMD3, CCP1MD, DISABLED;
    mov8 PMD3, LITERAL(DISABLED_ALL); ^ DISABLED(CCP1MD)); DISABLED(PWM6MD) | DISABLED(PWM5MD) | DISABLED(PWM4MD) | ENABLED(PWM3MD) | DISABLED(CCP2MD) | DISABLED(CCP1MD)); enable PWM 3, disable PWM 4 - 6, CCP 1 - 2
;    setbit PMD4, UART1MD, DISABLED;
;    setbit PMD4, CWG1MD, DISABLED;
    mov8 PMD4, LITERAL(DISABLED_ALL); ^ DISABLED(UART1MD)); ENABLED(UART1MD) | DISABLED(MSSP1MD) | DISABLED(CWG1MD)); disable EUSART1, CWG1, enable MSSP1
;    setbit PMD5, CLC4MD, DISABLED; IIFDEBUG(ENABLED, DISABLED);
;    setbit PMD5, CLC3MD, DISABLED;
    messg ^v REINSTATE
;    mov8 PMD5, LITERAL(DISABLED(CLC4MD) | DISABLED(CLC3MD) | ENABLED(CLC2MD) | ENABLED(CLC1MD)); disable CLC 3, 4, enable CLC 1, 2
    mov8 PMD5, LITERAL(DISABLED_ALL); ENABLED_ALL); DISABLED_ALL ^ DISABLED(CLC#v(WSPASS)MD) ^ DISABLED(CLC#v(WSDO)MD)); ENABLED(CLC4MD) | ENABLED(CLC3MD) | ENABLED(CLC2MD) | ENABLED(CLC1MD)); disable CLC 3, 4, enable CLC 1, 2
    endm


;NOTE: default is unlocked
pps_lock macro want_lock
;requires next 5 instructions in sequence:
    mov8 PPSLOCK, LITERAL(0x55);
    mov8 PPSLOCK, LITERAL(0xAA);
;    mov8 PPSLOCK, LITERAL(0); allow CLC1 output to be redirected to RA1/2/5/4
    setbit PPSLOCK, PPSLOCKED, want_lock; allow output pins to be reassigned
    endm


;initialize I/O pins:
;NOTE: RX/TX must be set for Input when EUSART is synchronous, however UESART controls this?
;#define NO_PPS  0
;#define INPUT_PINS  (BIT(WSDI) | BIT(RA#v(BREAKOUT))); //0x00); //all pins are output but datasheet says to set TRIS for peripheral pins; that is just to turn off general-purpose output drivers
iopin_init macro
    mov8 ANSELA, LITERAL(0); //all digital; CAUTION: do this before pin I/O
    mov8 WPUA, LITERAL(BIT(WSDI)); INPUT_PINS); //weak pull-up on input pins in case not connected (ignored if MCLRE configured)
#if 0
    messg are these needed? @2235
    mov8 ODCONA, LITERAL(0); push-pull outputs
    mov8 INLVLA, LITERAL(~0 & 0xff); shmitt trigger input levels;  = 0x3F;
    mov8 SLRCONA, LITERAL(~BIT(RA#v(WSDI)) & 0xff); on = 25 nsec slew, off = 5 nsec slew; = 0x37;
#endif
    mov8 LATA, LITERAL(0); //start low to prevent junk on line
    mov8 TRISA, LITERAL(BIT(WSDI)); | BIT(RA#v(BREAKOUT))); INPUT_PINS); //0x00); //all pins are output but datasheet says to set TRIS for peripheral pins; that is just to turn off general-purpose output drivers
;?    REPEAT LITERAL(RA5 - RA0 + 1), mov8 RA0PPS + repeater, LITERAL(NO_PPS); reset to LATA; is this needed? (datasheet says undefined at startup)
    endm


;    LIST
;    LIST_PUSH TRUE
;HFFRQ values:
;(these should be in p16f15313.inc)
    CONSTANT HFFRQ_#v(32 MHz) = b'110'
    CONSTANT HFFRQ_#v(16 MHz) = b'101'
    CONSTANT HFFRQ_#v(12 MHz) = b'100'
    CONSTANT HFFRQ_#v(8 MHz) = b'011'
    CONSTANT HFFRQ_#v(4 MHz) = b'010'
    CONSTANT HFFRQ_#v(2 MHz) = b'001'
    CONSTANT HFFRQ_#v(1 MHz) = b'000'
;    LIST_POP; pop
;    NOLIST

;set int osc freq:
;    CONSTANT CLKDIV = (FOSC_CFG / PWM_FREQ); CLK_FREQ / HFINTOSC_FREQ);
;#define HFINTOSC_NOSC  b'110' ;use OSCFRQ; 0; no change (use cfg); should be in p16f15313.inc
#define USE_HFFRQ  b'110'; should be in p16f15313.inc
;#define PWM_FREQ  (16 MHz); (FOSC_CFG / 2); need PWM freq 16 MHz because max speed is Timer2 / 2 and Timer2 max speed is FOSC/4
;#define FOSC_FREQ  PWM_FREQ; FOSC needs to run at least as fast as needed by PWM
;#define FOSC_FREQ  (32 MHz); (16 MHz); nope-FOSC needs to be a multiple of WS half-bit time; use 4 MIPS to allow bit-banging (DEBUG ONLY)
;    CONSTANT MY_OSCCON = USE_HFFRQ << NOSC0 | 0 << NDIV0; (log2(CLKDIV) << NDIV0 | HFINTOSC_NOSC << NOSC0);
;    messg [INFO] FOSC #v(FOSC_CFG), PWM freq #v(PWM_FREQ) @2268;, CLK DIV #v(CLKDIV) => my OSCCON #v(MY_OSCCON)
;    messg [INFO], Fosc #v(FOSC_FREQ) == 4 MIPS? #v(FOSC_FREQ == 4 MIPS), WS bit freq #v(WSBIT_FREQ), #instr/wsbit #v(FOSC_FREQ/4 / WSBIT_FREQ) @2269
fosc_init macro
;    mov8 OSCCON1, LITERAL(b'110' << NOSC0 | b'0000' << NDIV0
;RSTOSC in CONFIG1 tells HFFRQ to default to 32 MHz, use 2:1 div for 16 MHz:
    setbit OSCCON3, CSWHOLD, FALSE; use new clock as soon as stable (should be immediate if HFFRQ !changed)
    mov8 OSCCON1, LITERAL(USE_HFFRQ << NOSC0 | 0 << NDIV0); MY_OSCCON); 1:1
    mov8 OSCFRQ, LITERAL(HFFRQ_#v(FOSC_FREQ));
;    ERRIF CLK_FREQ != 32 MHz, [ERROR] need to set OSCCON1, clk freq #v(CLK_FREQ) != 32 MHz
;CAUTION: assume osc freq !change, just divider, so new oscillator is ready immediately
;;    ifbit PIR1, CSWIF, FALSE, goto $-1; wait for clock switch to complete
;    ifbit OSCCON3, ORDY, FALSE, goto $-1; wait for clock switch to complete
    endm


;general I/O initialization:
    doing_init TRUE
    EXPAND_PUSH TRUE
    iopin_init;
    fosc_init;
    pmd_init; turn off unused peripherals
    EXPAND_POP
;NOPE: PPS assigned during brkout_render    pps_lock TRUE; prevent pin reassignments; default is unlocked
    doing_init FALSE


;; config ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

; Configuration bits: selected in the GUI (MCC)
;#if EXT_CLK_FREQ  ;ext clock might be present
;MY_CONFIG &= _EC_OSC  ;I/O on RA4, CLKIN on RA5; external clock (18.432 MHz); if not present, int osc will be used
;MY_CONFIG &= _FCMEN_ON  ;turn on fail-safe clock monitor in case external clock is not connected or fails (page 33); RA5 will still be configured as input, though
;#else  ;EXT_CLK_FREQ
;MY_CONFIG &= _INTRC_OSC_NOCLKOUT  ;I/O on RA4+5; internal clock (default 4 MHz, later bumped up to 8 MHz)
;MY_CONFIG &= _FCMEN_OFF  ;disable fail-safe clock monitor; NOTE: this bit must explicitly be turned off since MY_CONFIG started with all bits ON
;#endif  ;EXTCLK_FREQ
;MY_CONFIG &= _IESO_OFF  ;internal/external switchover not needed; turn on to use optional external clock?  disabled when EC mode is on (page 31); TODO: turn on for battery-backup or RTC
;MY_CONFIG &= _BOR_OFF  ;brown-out disabled; TODO: turn this on when battery-backup clock is implemented?
;MY_CONFIG &= _CPD_OFF  ;data memory (EEPROM) NOT protected; TODO: CPD on or off? (EEPROM cleared)
;MY_CONFIG &= _CP_OFF  ;program code memory NOT protected (maybe it should be?)
;MY_CONFIG &= _MCLRE_OFF  ;use MCLR pin as INPUT pin (required for Renard); no external reset needed anyway
;MY_CONFIG &= _PWRTE_ON  ;hold PIC in reset for 64 msec after power up until signals stabilize; seems like a good idea since MCLR is not used
;MY_CONFIG &= _WDT_ON  ;use WDT to restart if software crashes (paranoid); WDT has 8-bit pre- (shared) and 16-bit post-scalars (page 125)
;	__config MY_CONFIG

    LIST_PUSH FALSE
    VARIABLE MY_CONFIG1 = -1  ;start with all Oscillator bits on, then EXPLICITLY turn them off below
MY_CONFIG1 &= _FCMEN_OFF  ; Fail-Safe Clock Monitor Enable bit->FSCM timer disabled
MY_CONFIG1 &= _CSWEN_OFF ;unneeded    ; Clock Switch Enable bit->Writing to NOSC and NDIV is allowed
MY_CONFIG1 &= _CLKOUTEN_OFF  ; Clock Out Enable bit->CLKOUT function is disabled; i/o or oscillator function on OSC2
;#define WANT_PLL  TRUE
;#ifdef WANT_PLL
; MY_CONFIG1 &= _RSTOSC_HFINTPLL  ;Power-up default value for COSC bits->HFINTOSC with 2x PLL, with OSCFRQ = 16 MHz and CDIV = 1:1 (FOSC = 32 MHz)
;#else
;set initial osc freq (will be overridden during startup):
MY_CONFIG1 &= _RSTOSC_HFINT32 ;HFINTOSC with OSCFRQ= 32 MHz and CDIV = 1:1
;#endif
;MY_CONFIG1 &= _RSTOSC_HFINT1  ;Power-up default value for COSC bits->HFINTOSC (1MHz)
    messg [TODO] use RSTOSC HFINT 1MHz? @2326
;#define OSCFRQ_CFG  (16 MHz)
;#define FOSC_CFG  (32 MHz) ;(16 MHz PLL) ;(OSCFRQ_CFG PLL); HFINTOSC freq 16 MHz with 2x PLL and 1:1 div gives 32 MHz (8 MIPS)
MY_CONFIG1 &= _FEXTOSC_OFF  ;External Oscillator mode selection bits->Oscillator not enabled
    VARIABLE MY_CONFIG2 = -1  ;start with all Supervisor bits on, then EXPLICITLY turn them off below
MY_CONFIG2 &= _STVREN_OFF  ; allow wrap: xition to threaded mode can happen from any stack depth; Stack Overflow/Underflow Reset Enable bit->Stack Overflow or Underflow will cause a reset
MY_CONFIG2 &= _PPS1WAY_ON ; Peripheral Pin Select one-way control->The PPSLOCK bit can be cleared and set only once in software
MY_CONFIG2 &= _ZCD_OFF   ; Zero-cross detect disable->Zero-cross detect circuit is disabled at POR.
MY_CONFIG2 &= _BORV_LO   ; Brown-out Reset Voltage Selection->Brown-out Reset Voltage (VBOR) set to 1.9V on LF, and 2.45V on F Devices
MY_CONFIG2 &= _BOREN_ON  ; Brown-out reset enable bits->Brown-out Reset Enabled, SBOREN bit is ignored
MY_CONFIG2 &= _LPBOREN_OFF   ; Low-Power BOR enable bit->ULPBOR disabled
MY_CONFIG2 &= _PWRTE_OFF  ; Power-up Timer Enable bit->PWRT disabled
MY_CONFIG2 &= _MCLRE_OFF  ; Master Clear Enable bit->MCLR pin function is port defined function
    VARIABLE MY_CONFIG3 = -1  ;start with all WIndowed Watchdog bits on, then EXPLICITLY turn them off below
; config WDTCPS = WDTCPS_31    ; WDT Period Select bits->Divider ratio 1:65536; software control of WDTPS
MY_CONFIG3 &= _WDTE_OFF  ; WDT operating mode->WDT Disabled, SWDTEN is ignored
; config WDTCWS = WDTCWS_7    ; WDT Window Select bits->window always open (100%); software control; keyed access not required
; config WDTCCS = SC    ; WDT input clock selector->Software Control
    VARIABLE MY_CONFIG4 = -1  ;start with all Memory bits on, then EXPLICITLY turn them off below
    MESSG [TODO] boot loader + LVP? @2345
MY_CONFIG4 &= _LVP_OFF ;ON?  ; Low Voltage Programming Enable bit->High Voltage on MCLR/Vpp must be used for programming
MY_CONFIG4 &= _WRTSAF_OFF  ; Storage Area Flash Write Protection bit->SAF not write protected
MY_CONFIG4 &= _WRTC_OFF  ; Configuration Register Write Protection bit->Configuration Register not write protected
MY_CONFIG4 &= _WRTB_OFF  ; Boot Block Write Protection bit->Boot Block not write protected
MY_CONFIG4 &= _WRTAPP_OFF  ; Application Block Write Protection bit->Application Block not write protected
MY_CONFIG4 &= _SAFEN_OFF  ; SAF Enable bit->SAF disabled
MY_CONFIG4 &= _BBEN_OFF  ; Boot Block Enable bit->Boot Block disabled
MY_CONFIG4 &= _BBSIZE_BB512  ; Boot Block Size Selection bits->512 words boot block size
    VARIABLE MY_CONFIG5 = -1  ;start with all Code Protection bits on, then EXPLICITLY turn them off below
MY_CONFIG5 &= _CP_OFF  ; UserNVM Program memory code protection bit->UserNVM code protection disabled
    LIST_PUSH TRUE
    __config _CONFIG1, MY_CONFIG1
    __config _CONFIG2, MY_CONFIG2
    __config _CONFIG3, MY_CONFIG3
    __config _CONFIG4, MY_CONFIG4
    __config _CONFIG5, MY_CONFIG5
    LIST_POP; pop
;config
; config FOSC = HS        ; Oscillator Selection bits (HS oscillator)
; config WDTE = OFF       ; Watchdog Timer Enable bit (WDT disabled)
; config PWRTE = OFF      ; Power-up Timer Enable bit (PWRT disabled)
; config BOREN = OFF      ; Brown-out Reset Enable bit (BOR disabled)
; config LVP = OFF        ; Low-Voltage (Single-Supply) In-Circuit Serial Programming Enable bit (RB3 is digital I/O, HV on MCLR must be used for programming)
; config CPD = OFF        ; Data EEPROM Memory Code Protection bit (Data EEPROM code protection off)
; config WRT = OFF        ; Flash Program Memory Write Enable bits (Write protection off; all program memory may be written to by EECON control)
; config CP = OFF         ; Flash Program Memory Code Protection bit (Code protection off)
    LIST_POP; pop

    EXPAND_POP
    LIST_POP
    messg end of hoist 2 @2376
;#else; too deep :(
#endif
#if HOIST == 1
    messg hoist 1: custom opc @2380
    LIST_PUSH FALSE; don't show this section in .LST file
    EXPAND_PUSH FALSE
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#ifdef WANT_DEBUG
 #define IIFDEBUG(expr_true, ignored)  expr_true
#else
 #define IIFDEBUG(ignored, expr_false)  expr_false
#endif
;#ifdef WANT_DEBUG
; #define NOLIST  LIST; leave it all on
;    messg [INFO] COMPILED FOR DEV/DEBUG! @2392
;#endif
    WARNIF(IIFDEBUG(TRUE, FALSE), [INFO] COMPILED FOR DEV/DEBUG! @2394);

    
    LIST n = 60, c = 200, t = on, n = 0  ;line (page) size, column size, truncate, no paging
;	LIST r=hex  ;radix; NOTE: this affects interpretation of literals, as well as output listing; ALWAYS use D'' with literals > 8
    LIST R = DEC
    LIST mm = on  ;memory map
    LIST st = on  ;symbol table
;    PAGEWIDTH   132
;    RADIX       DEC

#ifdef __16F15313
    LIST p = 16F15313
    PROCESSOR 16F15313  ;688 ;16F877A
#define LIST; disable within .inc
#define NOLIST; disable within .inc
;#include "P16F15313.INC"
 #include <p16f15313.inc>
#undefine NOLIST; re-enable
#undefine LIST; re-enable
#else
    error [ERROR] Unsupported device @2415; add others as support added
#endif
;pic-as not mpasm: #include <xc.inc>


;clock macros:
#define mhz(freq)  rdiv(freq, 1000000)
#define khz(freq)  rdiv(freq, 1000)
#define prescaler(base_freq, want_freq)  log2((base_freq) / (want_freq))
;CAUTION: avoid arith overflow:
;#define scale(freq, prescaler)  ((freq) / BIT(prescaler))
#define scale(freq, prescale)  (BIT(prescale) KHz / khz(freq)); split 1M factor to avoid arith overflow; BIT(PRESCALER - 3); usec
;#define prescfreq(prescaler)  (FOSC_FREQ / 4 / BIT(prescaler));
;readabililty macros:
;CAUTION: use with "()"
#define MHz  * 1000000
#define KHz  * 1000
;#define Hz  * 1
#define usec  * 1
#define msec  * 1000
#define sec  * 1000000
#define PLL  * 2; PLL on int osc is 2, ext clk is 4
#define MIPS  * 4 MHz ;4 clock cycles per instr


;* lookup tables (faster than computing as needed) ************************************

;add lookup for non-power of 2:
;find_log2 macro val
;    LOCAL bit = 0;
;    while BIT(bit)
;	if BIT(bit) > 0
;    messg #v(asmpower2), #v(oscpower2), #v(prescpower2), #v(asmbit) @2447
;	    CONSTANT log2(asmpower2) = asmbit
;	endif
;ASM_MSB set asmpower2  ;remember MSB; assembler uses 32-bit values
;asmpower2 *= 2
;    endm

;log2 function:
;converts value -> bit mask at compile time; CAUTION: assumes value is exact power of 2
;usage: LOG2_#v(bit#) = power of 2
;NOTE: only works for exact powers of 2
;equivalent to the following definitions:
;#define LOG2_65536  d'16'
; ...
;#define LOG2_4  2
;#define LOG2_2  1
;#define LOG2_1  0
;#define LOG2_0  0
;    EXPAND_PUSH FALSE
#define log2(n)  LOG2_#v(n)
;#define osclog2(freq)  OSCLOG2_#v(freq)
;#define osclog2(freq)  log2((freq) / 250 * 256); kludge: convert clock freq to power of 2
    CONSTANT log2(0) = 0 ;special case
;    CONSTANT osc_log2(0) = 0;
    VARIABLE asmbit = 0, asmpower2 = 1;, oscpower2 = 1, prescpower2 = 1;
    while asmpower2 ;asmbit <= d'16'  ;-1, 0, 1, 2, ..., 16
;	CONSTANT BIT_#v(IIF(bit < 0, 0, 1<<bit)) = IIF(bit < 0, 0, bit)
	if asmpower2 > 0
;    messg #v(asmpower2), #v(oscpower2), #v(prescpower2), #v(asmbit) @2475
	    CONSTANT log2(asmpower2) = asmbit
;	    CONSTANT osclog2(oscpower2) = asmbit
;	    CONSTANT log2(oscpower2) = asmbit
;	    CONSTANT log2(prescpower2) = asmbit
	endif
	if !(2 * asmpower2)
	    EMITL ASM_MSB EQU #v(asmpower2)  ;remember MSB; assembler uses 32-bit signed values so this should be 32
	endif
asmpower2 <<= 1
;oscpower2 *= 2
;	if oscpower2 == 128
;oscpower = 125
;	endif
;oscpower2 = IIF(asmpower2 != 128, IIF(asmpower2 != 32768, 2 * oscpower2, 31250), 125); adjust to powers of 10 for clock freqs
;prescpower2 = IIF(asmpower2 != 128, IIF(asmpower2 != 32768, 2 * prescpower2, 31250), 122); adjust to powers of 10 for prescalars
asmbit += 1
    endw
;    EXPAND_POP
    ERRIF(log2(1) | log2(0), [ERROR] LOG2_ constants are bad: log2(1) = #v(log2(1)) and log2(0) = #v(log2(0))"," should be 0 @2494); paranoid self-check
    ERRIF(log2(1024) != 10, [ERROR] LOG2_ constants are bad: log2(1024) = #v(log2(1024))"," should be #v(10) @2495); paranoid self-check
;    ERRIF (log2(1 KHz) != 10) | (log2(1 MHz) != 20), [ERROR] OSCLOG2_ constants are bad: log2(1 KHz) = #v(log2(1 KHz)) and log2(1 MHz) = #v(log2(1 MHz)), should be 10 and 20 ;paranoid self-check
;ASM_MSB set 0x80000000  ;assembler uses 32-bit values
    ERRIF((ASM_MSB << 1) || !ASM_MSB, [ERROR] ASM_MSB incorrect value: #v(ASM_MSB << 1)"," #v(ASM_MSB) @2498); paranoid check
    WARNIF((ASM_MSB | 0x800) & 0x800 != 0X800, [ERROR] bit-wise & !worky on ASM_MSB #v(ASM_MSB): #v((ASM_MSB | 0x800) & 0x800) @2499);


;get #bits in a literal value:
;    VARIABLE NUMBITS;
;numbits macro val
;NUMBITS = 
    
;get msb of a literal value:
    VARIABLE FOUND_MSB
find_msb macro value
;    EXPAND_PUSH TRUE
FOUND_MSB = ASM_MSB
    while FOUND_MSB
	if (value) & FOUND_MSB
;	    EXPAND_POP
	    exitm
	endif
FOUND_MSB >>= 1
    endw
;    EXPAND_POP
    endm


;; memory management helpers ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;PIC memory banks:
;#define COMMON_START  0
#define COMMON_END  0xC
#define GPR_START  0x20
#define GPR_END  0x70
;    CONSTANT GPR_LEN = GPR_END - GPR_START;
#define BANKLEN  0x80
;    CONSTANT NONBANKED_LEN = BANKLEN - GPR_END;
;line too long    CONSTANT BANKLEN = 0X80;
#define BANK_UNKN  -1 ;non-banked or unknown
;line too long    CONSTANT BANK_UNKN = -1; non-banked or unknown
#define BANKOFS(reg)  ((reg) % BANKLEN)
#define ISBANKED(reg)  ((BANKOFS(reg) >= COMMON_END) && (BANKOFS(reg) < GPR_END))
;    MESSG "TODO: check !banked reg also @2538"
#define BANKOF(reg)  IIF(ISBANKED(reg), REG2ADDR(reg) / BANKLEN, BANK_UNKN)
#define NEEDS_BANKSEL(regto, regfrom)  (ISBANKED(regto) && (BANKOF(regto) != BANKOF(regfrom)))

;optimized bank select:
;only generates bank selects if needed
    VARIABLE BANK_TRACKER = BANK_UNKN; ;currently selected bank
    VARIABLE BANKSEL_KEEP = 0, BANKSEL_DROP = 0; ;perf stats
BANKCHK MACRO reg; ;, fixit, undef_ok
    EXPAND_PUSH FALSE; reduce clutter in LST file
;    MESSG reg @2547
    LOCAL REG = reg ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
;    MESSG reg, #v(REG) @2549
;    messg "bankof reg, nobank", #v(BANKOF(REG)), #v(BANK_UNKN)  @2550;debug
    if !ISLIT(REG) && ISBANKED(REG); BANKOF(REG) == BANK_UNKN
        LOCAL REGBANK = BANKOF(REG) ;kludge: expanded line too long for MPASM
;    messg BANKOF(REG) @2553; #v(REGBANK);
	if REGBANK != BANKOF(BANK_TRACKER)  ;don't need to set RP0/RP1
;    messg "banksel bankof reg @2555"
;    movlb BANKOF(REG) ;bank sel
	    EMIT banksel reg;
BANKSEL_KEEP += 1
BANK_TRACKER = reg  ;remember where latest value came from (in case never set)
	else
;PREVBANK = REG  ;update last-used reg anyway (helpful for debug)
BANKSEL_DROP += 1  ;count saved instructions (macro perf)
	endif
    endif
    EXPAND_POP
    endm

; messg EOF_COUNT @__LINE__
eof_#v(EOF_COUNT) macro
    messg [INFO] bank sel: #v(BANKSEL_KEEP) (#v(pct(BANKSEL_KEEP, BANKSEL_KEEP + BANKSEL_DROP))%), dropped: #v(BANKSEL_DROP) (#v(pct(BANKSEL_DROP, BANKSEL_KEEP + BANKSEL_DROP))%) @2569; ;perf stats
    endm
EOF_COUNT += 1;


DROP_BANK macro
;    EXPAND_PUSH FALSE
BANK_TRACKER = BANK_UNKN  ;forget where latest value came from (used for jump targets)
;    EXPAND_POP
    endm

;avoid warnings when bank is known to be selected
;#define NOARG  -1; dummy arg (MPASM doesn't like missing/optional args)
BANKSAFE macro stmt
;    EXPAND_PUSH FALSE
;    NOEXPAND
    errorlevel -302  ;this is a useless/annoying message because the assembler doesn't handle it well (always generates warning when accessing registers in bank 1, even if you've set the bank select bits correctly)
;    messg BANKSAFE: stmt @2586
;        EXPAND_RESTORE
;    EXPAND_PUSH TRUE
    stmt
;    EXPAND_POP
;	NOEXPAND
    errorlevel +302 ;kludge: re-Enable bank switch warning
;    EXPAND_RESTORE
;    EXPAND_POP
    endm
;BANKSAFE1 macro stmt, arg
;    NOEXPAND
;    errorlevel -302  ;this is a useless/annoying message because the assembler doesn't handle it well (always generates warning when accessing registers in bank 1, even if you've set the bank select bits correctly)
;;    if arg == NOARG
;;        EXPAND_RESTORE
;;	stmt
;;	NOEXPAND
;;    else
;    messg stmt @2604
;    messg arg @2605
;        EXPAND_RESTORE
;	stmt, arg
;	NOEXPAND
;;    endif
;    errorlevel +302 ;kludge: re-Enable bank switch warning
;    EXPAND_RESTORE
;    endm
;BANKSAFE2 macro stmt, arg1, arsg2
;    NOEXPAND
;    errorlevel -302 ;kludge: Disable bank switch warning
;	EXPAND_RESTORE
;	stmt, arg1, arg2
;	NOEXPAND
;    errorlevel +302 ;kludge: re-Enable bank switch warning
;    EXPAND_RESTORE
;    endm
 

;jump target:
;set BSR and WREG unknown
DROP_CONTEXT MACRO
    DROP_BANK
    DROP_WREG
    endm


;    VARIABLE CTX_DEPTH = 0
;#define CONTEXT_PUSH  CTX_STATE TRUE
;#define CONTEXT_POP  CTX_STATE FALSE
;CTX_STATE macro push_pop
;    if BOOL2INT(push_pop)
;	VARIABLE CTX_ADDR#v(CTX_DEPTH) = $
;	VARIABLE CTX_WREG#v(CTX_DEPTH) = WREG_TRACKER
;	VARIABLE CTX_BANK#v(CTX_DEPTH) = BANK_TRACKER
;	DROP_CONTEXT
;CTX_DEPTH += 1
;    else
;CTX_DEPTH -= 1
;        ORG CTX_ADDR#v(CTX_DEPTH)
;WREG_TRACKER = CTX_WREG#v(CTX_DEPTH)
;BANK_TRACKER = CTX_BANK#v(CTX_DEPTH)
;    endif
;    endm

;push context under top of stack:
;CONTEXT_PUSH_UNDER macro
;    VARIABLE CTX_ADDR#v(CTX_DEPTH) = CTX_ADDR#v(CTX_DEPTH - 1);
;    VARIABLE CTX_WREG#v(CTX_DEPTH) = CTX_WREG#v(CTX_DEPTH - 1);
;    VARIABLE CTX_BANK#v(CTX_DEPTH) = CTX_BANK#v(CTX_DEPTH - 1);
;CTX_DEPTH -=1
;    CONTEXT_PUSH
;CTX_DEPTH +=1
;    endm

;eof_#v(EOF_COUNT) macro
;    WARNIF(CTX_DEPTH, [WARNING] context stack not empty @eof: #v(CTX_DEPTH)"," last addr = #v(CTX_ADDR#v(CTX_DEPTH - 1)) @2661)
;    endm
;EOF_COUNT += 1;

;save/restore compile-time execution context:
;allows better banksel/pagesel/wreg optimization
;kludge: use #v(0) in lieu of token pasting
;#define bitnum_arg(argg)  withbit_#v(argg)
    VARIABLE NUM_CONTEXT = 0
#define CONTEXT_ADDR(name)  ctx_addr_#v(name)
CONTEXT_SAVE macro name
name SET #v(NUM_CONTEXT); allow context access by caller-supplied name; allow re-def
NUM_CONTEXT += 1
    VARIABLE ctx_addr_#v(name) = $
    VARIABLE ctx_wreg_#v(name) = WREG_TRACKER
    VARIABLE ctx_bank_#v(name) = BANK_TRACKER
    VARIABLE ctx_page_#v(name) = PAGE_TRACKER
;no, let stmt change it;    DROP_CONTEXT
;    messg save ctx_#v(name)_addr #v(ctx_#v(name)_addr), ctx_#v(name)_page #v(ctx_#v(name)_page) @2678
    endm

CONTEXT_RESTORE macro name
;    messg restore ctx_#v(name)_addr #v(ctx_#v(name)_addr), ctx_#v(name)_page #v(ctx_#v(name)_page) @2682
    EMIT ORG ctx_addr_#v(name);
WREG_TRACKER = ctx_wreg_#v(name)
BANK_TRACKER = ctx_bank_#v(name)
PAGE_TRACKER = ctx_page_#v(name)
    endm


;convenience wrappers for SAFE_ALLOC macro:
;#define b0DCL(name)  ALLOC_GPR name, TRUE; banked alloc
;#define nbDCL(name)  ALLOC_GPR name, FALSE; non-banked alloc
#define b0DCL  ALLOC_GPR 0, ; bank 0 alloc
#define b1DCL  ALLOC_GPR 1, ; bank 1 alloc
#define nbDCL  ALLOC_GPR NOBANK, ; non-banked alloc
;allocate a banked/non-banked/reallocated variable:
;checks for address overflow on allocated variables
;also saves banked or non-banked RAM address for continuation in a later CBLOCK
    CONSTANT NOBANK = 9999; can't use -1 due to #v()
;    CONSTANT RAM_START#v(TRUE) = GPR_START, RAM_START#v(FALSE) = GPR_END;
;    CONSTANT MAX_RAM#v(TRUE) = GPR_END, MAX_RAM#v(FALSE) = BANKLEN;
;    CONSTANT RAM_LEN#v(TRUE) = MAX_RAM#v(TRUE) - RAM_START#v(TRUE), RAM_LEN#v(FALSE) = MAX_RAM#v(FALSE) - RAM_START#v(FALSE)
    CONSTANT RAM_START#v(0) = GPR_START, MAX_RAM#v(0) = GPR_END, RAM_LEN#v(0) = MAX_RAM#v(0) - RAM_START#v(0)
    CONSTANT RAM_START#v(1) = BANKLEN + GPR_START, MAX_RAM#v(1) = BANKLEN + GPR_END, RAM_LEN#v(1) = MAX_RAM#v(1) - RAM_START#v(1)
    CONSTANT RAM_START#v(NOBANK) = GPR_END, MAX_RAM#v(NOBANK) = BANKLEN, RAM_LEN#v(NOBANK) = MAX_RAM#v(NOBANK) - RAM_START#v(NOBANK)
;    VARIABLE NEXT_RAM#v(TRUE) = RAM_START#v(TRUE), NEXT_RAM#v(FALSE) = RAM_START#v(FALSE);
;    VARIABLE RAM_USED#v(TRUE) = 0, RAM_USED#v(FALSE) = 0;
    VARIABLE NEXT_RAM#v(0) = RAM_START#v(0), RAM_USED#v(0) = 0;
    VARIABLE NEXT_RAM#v(1) = RAM_START#v(1), RAM_USED#v(1) = 0;
    VARIABLE NEXT_RAM#v(NOBANK) = RAM_START#v(NOBANK), RAM_USED#v(NOBANK) = 0;
#define SIZEOF(name)  name#v(0)size; use #v(0) in lieu of token pasting
#define ENDOF(name)  (name + SIZEOF(name))
;params:
; name = variable name to allocate
; banked = flag controlling where it is allocated; TRUE/FALSE == yes/no, MAYBE == reallocate from caller-specified pool of reusable space
    VARIABLE RAM_BLOCK = 0; unique name for each block
ALLOC_GPR MACRO bank, name, numbytes
;    EXPAND_PUSH FALSE
;    NOEXPAND  ;reduce clutter
;    EXPAND_PUSH TRUE  ;show RAM allocations in LST
;    EXPAND ;show RAM allocations in LST
    EXPAND_PUSH TRUE; CAUTION: macro expand must be set outside of cblock
    CBLOCK NEXT_RAM#v(bank); BOOL2INT(banked))  ;continue where we left off last time
	name numbytes
    ENDC  ;can't span macros
    EXPAND_POP
;    EXPAND_PUSH FALSE
RAM_BLOCK += 1  ;need a unique symbol name so assembler doesn't complain; LOCAL won't work inside CBLOCK
;    EXPAND_RESTORE; NOEXPAND
    CBLOCK
	LATEST_RAM#v(RAM_BLOCK):0  ;get address of last alloc; need additional CBLOCK because macros cannot span CBLOCKS
    ENDC
;    NOEXPAND
NEXT_RAM#v(bank) = LATEST_RAM#v(RAM_BLOCK)  ;update pointer to next available RAM location
RAM_USED#v(bank) = NEXT_RAM#v(bank) - RAM_START#v(bank); BOOL2INT(banked))
    CONSTANT SIZEOF(name) = LATEST_RAM#v(RAM_BLOCK) - name;
    ERRIF(NEXT_RAM#v(bank) > MAX_RAM#v(bank), [ERROR] ALLOC_GPR: RAM overflow #v(LATEST_RAM#v(RAM_BLOCK)) > max #v(MAX_RAM#v(bank)) @2736); BOOL2INT(banked))),
;    ERRIF LAST_RAM_ADDRESS_#v(RAM_BLOCK) > RAM_END#v(BOOL2INT(banked)), [ERROR] SAFE_ALLOC: RAM overflow #v(LAST_RAM_ADDRESS_#v(RAM_BLOCK)) > end #v(RAM_END#v(BOOL2INT(banked)))
;    ERRIF LAST_RAM_ADDRESS_#v(RAM_BLOCK) <= RAM_START#v(BOOL2INT(banked)), [ERROR] SAFE_ALLOC: RAM overflow #v(LAST_RAM_ADDRESS_#v(RAM_BLOCK)) <= start #v(RAM_START#v(BOOL2INT(banked)))
;    EXPAND_POP,
;    EXPAND_POP,
;    EXPAND_POP
    ENDM

; messg EOF_COUNT @__LINE__
eof_#v(EOF_COUNT) macro
    if RAM_USED#v(0)
        messg [INFO] bank0 used: #v(RAM_USED#v(0))/#v(RAM_LEN#v(0)) (#v(pct(RAM_USED#v(0), RAM_LEN#v(0)))%) @2746
    endif
    if RAM_USED#v(1)
	MESSG [INFO] bank1 used: #v(RAM_USED#v(1))/#v(RAM_LEN#v(1)) (#v(pct(RAM_USED#v(1), RAM_LEN#v(1)))%) @2749
    endif
    if RAM_USED#v(NOBANK)
        MESSG [INFO] non-banked used: #v(RAM_USED#v(NOBANK))/#v(RAM_LEN#v(NOBANK)) (#v(pct(RAM_USED#v(NOBANK), RAM_LEN#v(NOBANK)))%) @2752
    endif
    endm
EOF_COUNT += 1;


;; custom 8-bit opcodes ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;#define PROGDCL  EMIT da; put value into prog space; use for opcodes or packed read-only data

;operand types:
;allows pseudo-opcodes to accept either literal or register values
;NOTE: assembler uses 32-bit constants internally; use msb to distinguish literal values from register addresses since it is not usually needed for code generation (which is only 8 or 14 bits)
;literal value operands:
#define LITERAL(n)  (ASM_MSB | (n))  ;prepend this to any 8-, 16- or 24-bit literal values used as pseudo-opcode parameters, to distinguish them from register addresses (which are only 1 byte)
#define ISLIT(val)  ((val) & ASM_MSB) ;((addr) & ASM_MSB) ;&& !ISPSEUDO(thing))  ;check for a literal
#define LIT2VAL(n)  ((n) & ~ASM_MSB)  ;convert from literal to number (strips _LITERAL tag)
;register operands:
#define REGISTER(a)  (a) ;address as-is
#define REG2ADDR(a)  (a)


;pseudo-reg:
;these have special meaning for mov8/MOVV/MOVWF
    CONSTANT INDF1_special = 0x10000;
    CONSTANT INDF1_preinc = (INDF1_special + 0); moviw ++INDF1
    CONSTANT INDF1_predec = (INDF1_special + 1); moviw --INDF1
    CONSTANT INDF1_postinc = (INDF1_special + 2); moviw INDF1++
    CONSTANT INDF1_postdec = (INDF1_special + 3); moviw INDF1--
    CONSTANT INDF0_special = 0x20000;
    CONSTANT INDF0_preinc = (INDF0_special + 0); moviw ++INDF0
    CONSTANT INDF0_predec = (INDF0_special + 1); moviw --INDF0
    CONSTANT INDF0_postinc = (INDF0_special + 2); moviw INDF0++
    CONSTANT INDF0_postdec = (INDF0_special + 3); moviw INDF0--
;#define MOVIW_opc(fsr, mode)  PROGDCL 0x10 | ((fsr) == FSR1) << 2 | ((mode) & 3)
#define MOVIW_opc(fsr, mode)  MOVIW_#v((fsr) == FSR1)_#v((mode) & 3)
#define MOVIW_1_0  MOVIW ++FSR1
#define MOVIW_1_1  MOVIW --FSR1
#define MOVIW_1_2  MOVIW FSR1++
#define MOVIW_1_3  MOVIW FSR1--
#define MOVIW_0_0  MOVIW ++FSR0
#define MOVIW_0_1  MOVIW --FSR0
#define MOVIW_0_2  MOVIW FSR0++
#define MOVIW_0_3  MOVIW FSR0--
;#define MOVWI_opc(fsr, mode)  PROGDCL 0x18 | ((fsr) == FSR1) << 2 | ((mode) & 3)
#define MOVWI_opc(fsr, mode)  MOVWI_#v((fsr) == FSR1)_#v((mode) & 3)
#define MOVWI_1_0  MOVWI ++FSR1
#define MOVWI_1_1  MOVWI --FSR1
#define MOVWI_1_2  MOVWI FSR1++
#define MOVWI_1_3  MOVWI FSR1--
#define MOVWI_0_0  MOVWI ++FSR0
#define MOVWI_0_1  MOVWI --FSR0
#define MOVWI_0_2  MOVWI FSR0++
#define MOVWI_0_3  MOVWI FSR0--


;move (copy) reg or value to reg:
;optimized to reduce banksel and redundant WREG loads
;    messg "TODO: optimize mov8 to avoid redundant loads @2810"
;#define UNKNOWN  -1 ;non-banked or unknown
    CONSTANT WREG_UNKN = ASM_MSB >> 1; -1; ISLIT == FALSE
    VARIABLE WREG_TRACKER = WREG_UNKN ;unknown at start
mov8 macro dest, src
;    EXPAND_PUSH FALSE
;    NOEXPAND  ;reduce clutter
;    if (SRC == DEST) && ((srcbytes) == (destbytes)) && !(reverse)  ;nothing to do
    LOCAL SRC = src ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
    LOCAL DEST = dest ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
    WARNIF(DEST == SRC, [WARNING] useless mov8 from dest to src @2820);
;    messg "mov8", #v(DEST), #v(SRC), #v(ISLIT(SRC)), #v(LIT2VAL(SRC)) @2821
;    messg src, dest @2822;
    if ISLIT(SRC)  ;unpack SRC bytes
; messg dest, #v(!LIT2VAL(SRC)), #v(DEST != WREG), #v(!(DEST & INDF0_special)), #v(!(DEST & INDF1_special)) @2824
	if !LIT2VAL(SRC) && (DEST != WREG) && !(DEST & INDF0_special) && !(DEST & INDF1_special)
;	    BANKCHK dest;
;	    BANKSAFE clrf dest; special case
;	    EMIT CLRF dest;
	    CLRF dest;
;	    EXPAND_POP
	    exitm
	endif
	if WREG_TRACKER != src
;	    EXPAND_RESTORE ;show generated opcodes
;	    EMIT movlw LIT2VAL(src); #v(LIT2VAL(SRC))
	    MOVLW LIT2VAL(src);
;	    NOEXPAND
;WREG_TRACKER = src
	endif
    else ;register
	if (SRC != WREG) && (SRC != WREG_TRACKER)
	    MOVF src, W;
	endif
;special pseudo-reg:
;	if src & INDF0_special
;;	    EXPAND_RESTORE; NOEXPAND
;	    EMIT MOVIW_opc(FSR0, SRC);
;;	    NOEXPAND  ;reduce clutter
;	else
;	    if src & INDF1_special
;;	        EXPAND_RESTORE; NOEXPAND
;		EMIT MOVIW_opc(FSR1, SRC);
;;		NOEXPAND  ;reduce clutter
;	    else
;		if (SRC != WREG) && (SRC != WREG_TRACKER)
;;		    BANKCHK src;
;;		    BANKSAFE dest_arg(W) movf src;, W;
;;WREG_TRACKER = src
;		    MOVF src, W;
;;		else
;;		    if (SRC == WREG) && (WREG_TRACKER == WREG_UNKN)
;;			messg [WARNING] WREG contents unknown here @2862
;;		    endif
;		endif
;	    endif
;	endif
    endif
;    if dest & INDF0_special
;;        EXPAND_RESTORE; NOEXPAND
;	EMIT MOVWI_opc(FSR0, dest);
;;	NOEXPAND  ;reduce clutter
;    else
;	if dest & INDF1_special
;;	    EXPAND_RESTORE; NOEXPAND
;	    EMIT MOVWI_opc(FSR1, dest);
;;	    NOEXPAND  ;reduce clutter
;	else
    if dest != WREG
;;		BANKCHK dest;
;;		BANKSAFE movwf dest; NOARG
	MOVWF dest;
;	    endif
;        endif
    endif
;    EXPAND_POP
    endm

DROP_WREG macro
;    EXPAND_PUSH FALSE
WREG_TRACKER = WREG_UNKN  ;forget latest value
;    EXPAND_POP
    endm


;2's complement:
comf2s macro reg, dest
;    EXPAND_PUSH FALSE
    BANKCHK reg;
;    BANKSAFE dest_arg(dest) comf reg;, dest;
    EMIT dest_arg(dest) comf reg;, dest;
;    messg here @2901
;    BANKSAFE dest_arg(F) incf IIF(dest == W, WREG, reg);, F;
    INCF IIF(dest == W, WREG, reg), F;
;    if (reg == WREG) && ISLIT(WREG_TRACKER)
    if (reg == WREG) || !BOOL2INT(dest)
;WREG_TRACKER = LITERAL((0 - LITVAL(WREG_TRACKER)) & 0xFF)
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL((0 - WREG_TRACKER) & 0xFF), WREG_UNKN)
;    else
;	if (dest == W) 
;	    DROP_WREG; unknown reg contents
;	endif
    endif
;    EXPAND_POP
    endm


;swap 2 reg:
;uses no temps
swapreg macro reg1, reg2
;    EXPAND_PUSH FALSE
    if (reg2) == WREG
	XORWF reg1, W; reg ^ WREG
	XORWF reg1, F; reg ^ (reg ^ WREG) == WREG
	XORWF reg1, W; WREG ^ (reg ^ WREG) == reg
    else
	if (reg1) != WREG
	    MOVF reg1, W;
	endif
	XORWF reg2, W; reg ^ WREG
	XORWF reg2, F; reg ^ (reg ^ WREG) == WREG
	XORWF reg1, F; WREG ^ (reg ^ WREG) == reg
    endif
;    EXPAND_POP
    endm


;bank-safe, tracker versions of opcodes:

#define CLRF  clrf_tracker; override default opcode for WREG tracking
;WREG tracking:
CLRF macro reg
;    EXPAND_PUSH FALSE
    BANKCHK reg
;too deep :(    mov8 reg, LITERAL(0);
    BANKSAFE EMIT clrf reg; PROGDCL 0x180 | ((reg) % (BANKLEN));
    if reg == WREG
WREG_TRACKER = LITERAL(0);
    endif
;    EXPAND_POP
    endm

LODW macro reg
    MOVF reg, W
    endm

#define MOVWF  movwf_banksafe
MOVWF macro reg
;    EXPAND_PUSH FALSE
    if (reg) & INDF0_special
;        EXPAND_RESTORE; NOEXPAND
	EMIT MOVWI_opc(FSR0, reg);
;	NOEXPAND  ;reduce clutter
    else
	if (reg) & INDF1_special
;	    EXPAND_RESTORE; NOEXPAND
	    EMIT MOVWI_opc(FSR1, reg);
;	    NOEXPAND  ;reduce clutter
	else
;	    if reg != WREG
	    BANKCHK reg;
;		BANKSAFE movwf dest; NOARG
	    BANKSAFE EMIT movwf reg;
	endif
    endif
;    EXPAND_POP
    endm


#define MOVF  movf_banksafe
MOVF macro reg, dest
;    EXPAND_PUSH FALSE
    if ((reg) & INDF0_special) && !BOOL2INT(dest)
;	    EXPAND_RESTORE; NOEXPAND
	EMIT MOVIW_opc(FSR0, reg);
;	    NOEXPAND  ;reduce clutter
WREG_TRACKER = WREG_UNKN;
    else
	if ((reg) & INDF1_special) && !BOOL2INT(dest)
;	        EXPAND_RESTORE; NOEXPAND
	    EMIT MOVIW_opc(FSR1, reg);
;		NOEXPAND  ;reduce clutter
WREG_TRACKER = WREG_UNKN;
	else
;	    if (SRC != WREG) && (SRC != WREG_TRACKER)
	    BANKCHK reg;
	    BANKSAFE EMIT dest_arg(dest) movf reg;, dest;
;WREG_TRACKER = src
	    if !BOOL2INT(dest); || (reg == WREG)
WREG_TRACKER = reg; IIF(ISLIT(WREG_TRACKER), WREG_TRACKER + 1, WREG_UNKN)
	    endif
	endif
    endif
;    EXPAND_POP
    endm


#define INCF  incf_banksafe
INCF macro reg, dest
;    EXPAND_PUSH FALSE
    BANKCHK reg
    BANKSAFE EMIT dest_arg(dest) incf reg;, dest;
    if (reg == WREG) || !BOOL2INT(dest)
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), WREG_TRACKER + 1, WREG_UNKN)
    endif
;    EXPAND_POP
    endm


#define DECF  decf_banksafe
DECF macro reg, dest
;    EXPAND_PUSH FALSE
    BANKCHK reg
    BANKSAFE EMIT dest_arg(dest) decf reg;, dest;
    if (reg == WREG) || !BOOL2INT(dest)
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), WREG_TRACKER + 1, WREG_UNKN)
    endif
;    EXPAND_POP
    endm

#define ADDWF  addwf_banksafe
ADDWF macro reg, dest
;    EXPAND_PUSH FALSE
    BANKCHK reg
    BANKSAFE EMIT dest_arg(dest) addwf reg;, dest;
    if (reg == WREG) || !BOOL2INT(dest)
WREG_TRACKER = WREG_UNKN; IIF(ISLIT(WREG_TRACKER), WREG_TRACKER + 1, WREG_UNKN)
    endif
;    EXPAND_POP
    endm


#define SET8W  IORLW 0xFF; set all WREG bits
#define clrw  clrf WREG; clrw_tracker; override default opcode for WREG tracking
#define CLRW  CLRF WREG; clrw_tracker; override default opcode for WREG tracking
#define incw  addlw 1
#define INCW  ADDLW 1
;WREG tracking:
;clrw macro
;    mov8 WREG, LITERAL(0);
;    clrf WREG;
;    endm

;#define moviw  moviw_tracker; override default opcode for WREG tracking
;moviw macro arg
;    moviw arg
;    DROP_WREG
;    endm

#define MOVLW  movlw_tracker; override default opcode for WREG tracking
MOVLW macro value
;    EXPAND_PUSH FALSE
;    andlw arg
    ERRIF((value) & ~0xFF, [ERROR] extra MOV bits ignored: #v((value) & ~0xFF) @3058)
    if WREG_TRACKER != LITERAL(value)
;    EXPAND_RESTORE; NOEXPAND
;    messg movlw_tracker: "value" #v(value) value @3061
        EMIT movlw value; #v(value); PROGDCL 0x3000 | (value)
;    NOEXPAND; reduce clutter
WREG_TRACKER = LITERAL(value)
    endif
;    EXPAND_POP
    endm

    messg [TODO]: need to UNLIT WREG_TRACKER when used in arith (else upper bits might be affected)

#define ANDLW  andlw_tracker; override default opcode for WREG tracking
ANDLW macro value
;    EXPAND_PUSH FALSE
;    andlw arg
    ERRIF((value) & ~0xFF, [ERROR] extra AND bits ignored: #v((value) & ~0xFF) @3075)
;    EXPAND_RESTORE; NOEXPAND
    EMIT andlw value; PROGDCL 0x3900 | value
;    NOEXPAND; reduce clutter
;don't do this: (doesn't handle STATUS)
    if WREG_TRACKER != WREG_UNKN
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER & (value)), WREG_UNKN)
    endif
;    DROP_WREG
;    EXPAND_POP
    endm

#define IORLW  iorlw_tracker; override default opcode for WREG tracking
IORLW macro value
;    EXPAND_PUSH FALSE
;    andlw arg
    ERRIF((value) & ~0xFF, [ERROR] extra IOR bits ignored: #v((value) & ~0xFF) @3091)
;    EXPAND_RESTORE; NOEXPAND
    EMIT iorlw value; PROGDCL 0x3800 | value
;    NOEXPAND; reduce clutter
;don't do this: (doesn't handle STATUS)
    if WREG_TRACKER != WREG_UNKN
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER | (value)), WREG_UNKN)
    endif
;    DROP_WREG
;    EXPAND_POP
    endm

#define XORLW  xorlw_tracker; override default opcode for WREG tracking
XORLW macro value
;    EXPAND_PUSH FALSE
;    andlw arg
    ERRIF((value) & ~0xFF, [ERROR] extra XOR bits ignored: #v((value) & ~0xFF) @3107)
;    EXPAND_RESTORE; NOEXPAND
    EMIT xorlw value; PROGDCL 0x3A00 | (value)
;    NOEXPAND; reduce clutter
;don't do this: (doesn't handle STATUS)
    if WREG_TRACKER != WREG_UNKN
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER ^ (value)), WREG_UNKN)
    endif
;    DROP_WREG
;    EXPAND_POP
    endm

#define ADDLW  addlw_tracker; override default opcode for WREG tracking
ADDLW macro value
;    EXPAND_PUSH FALSE
;    addlw arg
    ERRIF((value) & ~0xFF, [ERROR] extra ADD bits ignored: #v((value) & ~0xFF) @3123)
;    EXPAND_RESTORE; NOEXPAND
    EMIT addlw value; PROGDCL 0x3E00 | (value)
;    NOEXPAND; reduce clutter
;don't do this: (doesn't handle STATUS)
    if WREG_TRACKER != WREG_UNKN
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER + (value)), WREG_UNKN)
    endif
;    DROP_WREG
;    EXPAND_POP
    endm

#define SUBLW  sublw_tracker; override default opcode for WREG tracking
SUBLW macro value
;    EXPAND_PUSH FALSE
;    addlw arg
    ERRIF((value) & ~0xFF, [ERROR] extra SUB bits ignored: #v((value) & ~0xFF) @3139)
;    EXPAND_RESTORE; NOEXPAND
    EMIT sublw value; PROGDCL 0x3E00 | (value)
;    NOEXPAND; reduce clutter
;don't do this: (doesn't handle STATUS)
    if WREG_TRACKER != WREG_UNKN
;CAUTION: operands are reversed: W subtract *from* lit
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL((value) - WREG_TRACKER), WREG_UNKN)
    endif
;    DROP_WREG
;    EXPAND_POP
    endm

;k - W - !B(C) => W
SUBLWB macro value
    ifbit BORROW TRUE, incw; apply Borrow first (sub will overwrite it)
    SUBLW value;
    endm


#define DECFSZ  decfsz_tracker; override default opcode for WREG tracking
DECFSZ macro reg, dest; TODO: add goto arg for PAGECHK
;    EXPAND_PUSH FALSE
;    addlw arg
;    NOEXPAND; reduce clutter
    BANKCHK reg;
    BANKSAFE EMIT dest_arg(dest) decfsz reg;
;don't do this: (doesn't handle STATUS)
;    if WREG_TRACKER != WREG_UNKN
    if reg == WREG
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER - 1), WREG_UNKN)
    else
	if dest == W
WREG_TRACKER = WREG_UNKN
	endif
    endif
;    DROP_WREG
;    EXPAND_POP
    endm


#define BSF  bsf_tracker
BSF macro reg, bitnum
;    EXPAND_PUSH FALSE
    ERRIF((bitnum) & ~7, [ERROR] invalid bitnum ignored: #v(bitnum) @3183)
    BANKCHK reg
    BANKSAFE EMIT bitnum_arg(bitnum) bsf reg
    if reg == WREG
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER | BIT(bitnum)), WREG_UNKN)
    endif
;    EXPAND_POP
    endm


#define BCF  bcf_tracker
BCF macro reg, bitnum
;    EXPAND_PUSH FALSE
    ERRIF((bitnum) & ~7, [ERROR] invalid bitnum ignored: #v(bitnum) @3196)
    BANKCHK reg
    BANKSAFE EMIT bitnum_arg(bitnum) bcf reg
    if reg == WREG
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER), LITERAL(WREG_TRACKER & ~BIT(bitnum)), WREG_UNKN)
    endif
;    EXPAND_POP
    endm


;; custom multi-byte opcodes (little endian): ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;broken (line too long)
#define LOBYTE(val)  BYTEOF(val, 0); IIF(ISLIT(val), LITERAL((val) & 0xFF), REGLO(val))
#define MIDBYTE(val)  BYTEOF(val, 1); IIF(ISLIT(val), LITERAL((val) >> 8 & 0xFF), REGMID(val))
#define HIBYTE24(val)  BYTEOF(val, 2); IIF(ISLIT(val), LITERAL((val) >> 16 & 0xFF), REGHI(val))
#define HIBYTE16(val)  BYTEOF(val, 1); IIF(ISLIT(val), LITERAL((val) >> 16 & 0xFF), REGHI(val))
;#define BYTEOF(val, byte)  BYTEOF_#v(ISLIT(val)) (val, byte)
;#define BYTEOF_0(val, byte)  ((val) + (byte)); register
;#define BYTEOF_1(val, byte)  ((val) & 0xFF << (8 * (byte))); literal
;little endian: byte 0 = LSB
#define BYTEOF(val, which)  IIF(ISLIT(val), BYTEOF_LIT(val, which), BYTEOF_REG(val, which))
#define BYTEOF_LIT(val, which)  LITERAL(((val) >> (8 * (which))) & 0xFF); literal
#define BYTEOF_REG(val, which)  REGISTER((val) + (which)); register, little endian


;    messg #v(PWM3DC), #v(PWM3DCL), #v(PWM3DCH) @3222
#define mov16  mov_mb 16,
#define mov24  mov_mb 24,
;TODO?: mov32  mov_mb 32,
mov_mb macro numbits, dest, src
;    EXPAND_PUSH FALSE
;    NOEXPAND  ;reduce clutter
;    if (SRC == DEST) && ((srcbytes) == (destbytes)) && !(reverse)  ;nothing to do
;    LOCAL SRC = src ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
;    LOCAL DEST = dest ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
    LOCAL LODEST = REGLO(dest);
;    messg "check HI " dest @3233
    LOCAL HIDEST = REGHI(dest);
    if numbits > 16
;        messg "check MID " dest @3236
	LOCAL MIDDEST = REGMID(dest);
        ERRIF((HIDEST != MIDDEST+1) || (MIDDEST != LODEST+1), [ERROR] dest is not 24-bit little endian"," lo@#v(LODEST) mid@#v(MIDDEST) hi@#v(HIDEST) @3238)
    else
;	messg #v(len), #v(LODEST), #v(LO(dest)), #v(HIDEST), #v(HI(dest)) @3240
	ERRIF(HIDEST != LODEST+1, [ERROR] dest is not 16-bit little endian: lo@#v(LODEST)"," hi@#v(HIDEST) @3241)
    endif
    LOCAL SRC = src ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
    if ISLIT(SRC)  ;unpack SRC bytes
	mov8 REGLO(dest), LITERAL(SRC & 0xFF)
	if numbits > 16
	    mov8 REGMID(dest), LITERAL(SRC >> 8 & 0xFF)
	    mov8 REGHI(dest), LITERAL(SRC >> 16 & 0xFF)
	else
	    mov8 REGHI(dest), LITERAL(SRC >> 8 & 0xFF)
	endif
    else ;register
	LOCAL LOSRC = REGLO(src);
;        messg "get HI " src @3254
	LOCAL HISRC = REGHI(src);
	mov8 REGLO(dest), REGLO(src)
	if numbits > 16
	    LOCAL MIDSRC = REGMID(src);
	    ERRIF((HISRC != MIDSRC+1) || (MIDSRC != LOSRC+1), [ERROR] src is not 24-bit little endian"," lo@#v(LOSRC) mid@#v(MIDSRC) hi@#v(HISRC) @3259)
;	    messg "get MID " src @3260
	    mov8 REGMID(dest), REGMID(src)
	else
;	    messg #v(len), #v(LOSRC), #v(LO(src)), #v(HISRC), #v(HI(src)) @3263
	    ERRIF(HISRC != LOSRC+1, [ERROR] src is not 16-bit little endian: lo@#v(LOSRC)"," hi@#v(HISRC) @3264)
	endif
	mov8 REGHI(dest), REGHI(src)
    endif
;    EXPAND_RESTORE
;    EXPAND_POP
    endm


;load immediate:
;uses FSR1 (not restored_
;customize as needed for varying lengths
;kludge: wrapped as macro to avoid code gen unless needed (and to avoid reset org)
    VARIABLE LDI_expanded = FALSE;
    messg [TODO] unpack 12 bits per addr instead of 8, reuse LDI_len temp @__LINE__
LDI macro size
    if !LDI_expanded
        nbDCL LDI_len,;
LDI_expanded = TRUE;
    endif
LDI_#v(size): DROP_CONTEXT
    mov16 FSR1, TOS; data immediately follows "call"
    setbit REGHI(FSR1), log2(0x80), TRUE; access prog space
    mov8 LDI_len, LITERAL(8);
    PAGECHK LDI_#v(size)_loop; do this before decfsz
LDI_#v(size)_loop: ;NOTE: each INDF access from prog space uses 1 extra instr cycle
    mov8 INDF0_postinc, INDF1_postinc; repeat 3x to reduce loop overhead
    mov8 INDF0_postinc, INDF1_postinc;
    mov8 INDF0_postinc, INDF1_postinc;
    DECFSZ LDI_len, F
    GOTO LDI_#v(size)_loop;
    mov16 TOS, FSR1; return past immediate data
    return;
    endm


#if 0
	PAGECHK memcpy_loop; do this before decfsz
memcpy_loop: DROP_CONTEXT;
    mov8 INDF0_postinc, INDF1_postinc;
    DECFSZ WREG, F
    GOTO memcpy_loop;
    return;
memcpy macro dest, src, len
    mov16 FSR0, LITERAL(dest);
    mov16 FSR1, LITERAL(src);
    mov8 WREG, len;
    endm
#endif


;24-bit rotate left:
;C bit comes into lsb
;rlf24 macro reg
;    rlf REGLO(reg), F
;    rlf REGMID(reg), F
;    rlf REGHI(reg), F
;    endm


;kludge: need inner macro level to force arg expansion:
;#define CONCAT(lhs, rhs)  lhs#v(0)rhs

;kludge: MPASM token-pasting only occurs around #v():
#define REGHI(name)  name#v(0)hi ;CONCAT(name, H)
#define REGLO(name)  name ;leave LSB as-is to use as generic name ref ;CONCAT(name, L)
;    CONSTANT REGHI(PWM3DC) = PWM3DCH; shim
b0DCL16 macro name
;    EXPAND_PUSH FALSE
    b0DCL REGLO(name),:2
;    b0DCL REGHI(name),
    EMIT CONSTANT REGHI(name) = REGLO(name) + 1;
;    CONSTANT name = REGLO(name); kludge: allow generic reference to both bytes
;    EXPAND_POP
    endm

nbDCL16 macro name
;    EXPAND_PUSH FALSE
    nbDCL REGLO(name),:2
;    nbDCL REGHI(name),
    EMIT CONSTANT REGHI(name) = REGLO(name) + 1;
;    CONSTANT name = REGLO(name); kludge: allow generic reference to both bytes
;    EXPAND_POP
    endm

#define REGMID(name)  name#v(0)mid ;CONCAT(name, M)
b0DCL24 macro name
;    EXPAND_PUSH FALSE
    b0DCL REGLO(name),:3
;    b0DCL REGMID(name),
;    b0DCL REGHI(name),
    EMIT CONSTANT REGMID(name) = REGLO(name) + 1;
    EMIT CONSTANT REGHI(name) = REGLO(name) + 2;
;    CONSTANT name = REGLO(name); kludge: allow generic reference to all 3 bytes
;    EXPAND_POP
    endm

nbDCL24 macro name
;    EXPAND_PUSH FALSE
    nbDCL REGLO(name),:3
;    nbDCL REGMID(name),
;    nbDCL REGHI(name),
    EMIT CONSTANT REGMID(name) = REGLO(name) + 1;
    EMIT CONSTANT REGHI(name) = REGLO(name) + 2;
;    CONSTANT name = REGLO(name); kludge: allow generic reference to all 3 bytes
;    EXPAND_POP
    endm


;    LIST_PUSH TRUE
    CONSTANT REGHI(FSR0) = FSR0H; mov16 shim
    CONSTANT REGHI(FSR1) = FSR1H; mov16 shim
TOS EQU TOSL; make naming more consistent
    CONSTANT REGHI(TOS) = TOSH; mov16 shim
    CONSTANT REGHI(SP1BRG) = SP1BRGH; mov16 shim
;    LIST_POP

;; custom 1-bit opcodes: ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;bit operands:
#define BIT(n)  (1 << (n)); YNBIT(1, n); //(1 << (n))
#define REVBIT(n)  (0x80 >> (n))
#define NOBIT(n)  0; //YNBIT(0, n); (0 << (n))
;#define YNBIT(yesno, n)  ((yesno) << (n))
#define XBIT(n)  NOBIT(n); don't care (safer to turn off?)
#define LITBIT(n)  LITERAL(BIT(n))


;allocate a 1-bit variable (cuts down on memory usage):
;currently bit variables are allocated in non-banked RAM to cut down on bank selects
;all bit vars are initialized to 0
    VARIABLE BITDCL_COUNT = 0;
#define BITPARENT(name)  BITVARS#v(name / 8), 7 - name % 8; for ifbit/setbit
BITDCL MACRO name  ;, banked
    EXPAND_PUSH FALSE; hide clutter in LST file
;    LOCAL banked = FALSE  ;don't need this param; hard-code to OFF
    if !(BITDCL_COUNT % 8); allocate more storage space
;	if banked
;	    BDCL BITDCL#v(BITDCL_COUNT_#v(banked) / 8)
;	else
;	NBDCL BITDCL#v(BITDCL_COUNT_#v(banked) / 8)
        nbDCL BITVARS#v(BITDCL_COUNT / 8),; //general-use bit vars
        doing_init TRUE;
	mov8 BITVARS#v(BITDCL_COUNT / 8), LITERAL(0); init all bit vars to 0
	doing_init FALSE;
;	endif
    endif
    EMIT CONSTANT name = BITDCL_COUNT; _#v(banked); remember where the bit is
BITDCL_COUNT += 1; _#v(banked) += 1
    EXPAND_POP
    ENDM

eof_#v(EOF_COUNT) macro
    messg [INFO] (non-banked) Bit vars: allocated #v(8 * divup(BITDCL_COUNT, 8)), used #v(BITDCL_COUNT) @__LINE__
    endm
EOF_COUNT += 1;


;setbit_only macro dest, bit, bitval
;    mov8 dest, LITERAL(IIF(BOOL2INT(bitval), BIT(bit), 0)
;    endm
;set/clear bit:
setbit macro dest, bit, bitval
;    EXPAND_PUSH FALSE
;    NOEXPAND  ;reduce clutter
;    if (SRC == DEST) && ((srcbytes) == (destbytes)) && !(reverse)  ;nothing to do
;    LOCAL BIT = bit ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
    LOCAL DEST = dest ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
;    messg "mov8", #v(DEST), #v(SRC), #v(ISLIT(SRC)), #v(LIT2VAL(SRC)) @3360
;    messg src, dest @3361;
;    BANKCHK dest;
    LOCAL BITNUM = #v(bit)
    if BOOL2INT(bitval)
;        BANKSAFE bitnum_arg(BITNUM) bsf dest;, bit;
;        EMIT bitnum_arg(BITNUM) BSF dest;, bit;
        BSF dest, bit;
    else
;	BANKSAFE bitnum_arg(BITNUM) bcf dest;, bit;
;	EMIT bitnum_arg(BITNUM) BCF dest;, bit;
	BCF dest, bit;
    endif
    if dest == WREG
;	if ISLIT(WREG_TRACKER)
;	    if BOOL2INT(bitval)
;WREG_TRACKER |= BIT(bit)
;	    else
;WREG_TRACKER &= ~BIT(bit)
;	    endif
;	else
;WREG_TRACKER = WREG_UNK
;	endif
	if BOOL2INT(bitval)
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER, WREG_TRACKER | BIT(bit), WREG_UNKN);
	else
WREG_TRACKER = IIF(ISLIT(WREG_TRACKER, WREG_TRACKER & ~BIT(bit), WREG_UNKN);
	endif
    endif
;    EXPAND_RESTORE
;    EXPAND_POP
    endm


;single-arg variants:
;BROKEN
;    VARIABLE bitnum = 0;
;    while bitnum < 8
;biton_#v(bitnum) macro reg
;	setbit reg, bitnum, TRUE;
;	endm
;bitoff_#v(bitnum) macro reg
;	setbit reg, bitnum, FALSE;
;	endm
;bitnum += 1
;    endw
biton_#v(0) macro reg
	setbit reg, 0, TRUE;
	endm
bitoff_#v(0) macro reg
	setbit reg, 0, FALSE;
	endm
biton_#v(1) macro reg
	setbit reg, 1, TRUE;
	endm
bitoff_#v(1) macro reg
	setbit reg, 1, FALSE;
	endm
biton_#v(2) macro reg
	setbit reg, 2, TRUE;
	endm
bitoff_#v(2) macro reg
	setbit reg, 2, FALSE;
	endm
biton_#v(3) macro reg
	setbit reg, 3, TRUE;
	endm
bitoff_#v(3) macro reg
	setbit reg, 3, FALSE;
	endm
biton_#v(4) macro reg
	setbit reg, 4, TRUE;
	endm
bitoff_#v(4) macro reg
	setbit reg, 4, FALSE;
	endm
biton_#v(5) macro reg
	setbit reg, 5, TRUE;
	endm
bitoff_#v(5) macro reg
	setbit reg, 5, FALSE;
	endm
biton_#v(6) macro reg
	setbit reg, 6, TRUE;
	endm
bitoff_#v(6) macro reg
	setbit reg, 6, FALSE;
	endm
biton_#v(7) macro reg
	setbit reg, 7, TRUE;
	endm
bitoff_#v(7) macro reg
	setbit reg, 7, FALSE;
	endm


;alias for ifbit tests:
#define EQUALS0  STATUS, Z,
#define BORROW  STATUS, C, ! ;Borrow == !Carry; CAUTION: ifbit arg3 inverted
#define CARRY  STATUS, C, 


;use same #instr if result known @compile time:
ifbit_const macro reg, bitnum, bitval, stmt
    if ISLIT(reg)
	if BOOL2INT(LIT2VAL(reg) & BIT(bitnum)) == BOOL2INT(bitval)
;	    EXPAND_PUSH TRUE
	    NOP 1; //replace bit test instr
	    EMIT stmt
;	    EXPAND_POP
	else
	    NOP 2; //replace both instr
	endif
	exitm
    endif
    ifbit reg, bitnum, bitval, stmt
    endm

;check reg bit:
;stmt must be 1 opcode (due to btfxx instr)
;doesn't emit btfxx if stmt is null, but might emit extraneous banksel
;    VARIABLE STMT_COUNTER = 0
ifbit macro reg, bitnum, bitval, stmt
;    EXPAND_PUSH FALSE
;    NOEXPAND  ;reduce clutter
;    if (SRC == DEST) && ((srcbytes) == (destbytes)) && !(reverse)  ;nothing to do
;    LOCAL BIT = bit ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
    LOCAL REG = reg ;kludge; force eval (avoids "missing operand" and "missing argument" errors/MPASM bugs); also helps avoid "line too long" messages (MPASM limit 200)
;    messg "mov8", #v(DEST), #v(SRC), #v(ISLIT(SRC)), #v(LIT2VAL(SRC)) @3488
;    messg src, dest @3489;
    if ISLIT(reg); compile-time check
	if BOOL2INT(LIT2VAL(reg) & BIT(bitnum)) == BOOL2INT(bitval)
;	    EXPAND_PUSH TRUE
	    EMIT stmt
;	    EXPAND_POP
	endif
;        EXPAND_POP
	exitm
    endif
;    BANKCHK reg;
;    if BOOL2INT(bitval)
;	BANKSAFE bitnum_arg(bitnum) btfsc reg;, bitnum;
;    else
;	BANKSAFE bitnum_arg(bitnum) btfss reg;, bitnum;
;    endif
;;    LOCAL BEFORE_STMT = $
;;STMT_ADDR#v(STMT_COUNTER) = 0-$
;    LOCAL STMT_ADDR
;STMT_INSTR = 0 - $
;    LOCAL SVWREG = WREG_TRACKER
;    EXPAND_RESTORE
;    stmt
;    NOEXPAND  ;reduce clutter
;    if WREG_TRACKER != SVWREG
;	DROP_WREG
;;	messg WREG unknown here, conditional stmt might have changed it @3515
;    endif
;;STMT_ADDR#v(STMT_COUNTER) += $
;STMT_INSTR += $
;;    LOCAL STMT_INSTR = STMT_ADDR; #v(STMT_COUNTER)
;;STMT_COUNTER += 1
;;    LOCAL AFTER_STMT = 0; $ - (BEFORE_STMT + 1)
;    WARNIF((STMT_INSTR != 1) && !ISLIT(reg), [ERROR] if-ed stmt !1 opcode: #v(STMT_INSTR), @3522); use warn to allow compile to continue
    LOCAL NUM_IFBIT = NUM_CONTEXT; kludge: need unique symbols
    LOCAL has_banksel = $
    BANKCHK reg; do this before allocating fized-sized placeholder
has_banksel -= $
    LOCAL before_addr = $, before_bank = BANK_TRACKER;, before_wreg = WREG_TRACKER
    CONTEXT_SAVE before_#v(NUM_IFBIT)
    ORG before_addr + 1; leave placeholder for btf; backfill after checking for idler
;    EXPAND_PUSH TRUE
    EMIT stmt;
;    EXPAND_POP
    LOCAL after_addr = $, after_bank = BANK_TRACKER;, after_wreg = WREG_TRACKER
    CONTEXT_SAVE after_#v(NUM_IFBIT)
    LOCAL bank_changed = BANKOF(after_bank);
bank_changed -= BANKOF(before_bank); line too long :(
;    ORG before_addr
;BANK_TRACKER = before_bank
;WREG_TRACKER = before_wreg
    CONTEXT_RESTORE before_#v(NUM_IFBIT)
    if after_addr == before_addr + 1; no stmt
	WARNIF(has_banksel, [INFO] emitted extraneous banksel (no stmt for ifbit) @3542);
    else; back-fill btf instr
	if BOOL2INT(bitval)
	    BANKSAFE bitnum_arg(bitnum) btfsc reg;, bitnum;
	else
	    BANKSAFE bitnum_arg(bitnum) btfss reg;, bitnum;
	endif
;	ORG after_addr
;BANK_TRACKER = after_bank
;WREG_TRACKER = after_wreg
	CONTEXT_RESTORE after_#v(NUM_IFBIT)
    endif
;    EXPAND_POP
NUM_IFBIT += 1; kludge: need unique labels
    endm


;wait for bit:
;optimized for shortest loop
whilebit macro reg, bitnum, bitval, idler
    EXPAND_PUSH FALSE
    LOCAL loop, around
    EMITL loop:
    if ISLIT(reg); bit won't change; do idler forever or never
;	ifbit reg, bitnum, bitval, idler
	if BOOL2INT(LITVAL(reg) & BIT(bitnum)) == BOOL2INT(bitval)
;	    EXPAND_PUSH TRUE
	    EMIT idler
	    GOTO loop;
;	    EXPAND_POP
	endif
        EXPAND_POP
	exitm
    endif
    LOCAL NUM_WHILEBIT = NUM_CONTEXT; kludge: need unique symbols
    BANKCHK reg; allow this to be skipped in loop
    LOCAL before_idler = $, before_bank = BANK_TRACKER;, before_wreg = WREG_TRACKER
    CONTEXT_SAVE before_#v(NUM_WHILEBIT)
    ORG before_idler + 2; leave placeholder for btf + goto; backfill after checking for idler
;    EXPAND_POP
    EMIT idler; allows cooperative multi-tasking (optional)
;    EXPAND_PUSH FALSE
    LOCAL after_idler = $, after_bank = BANK_TRACKER;, after_wreg = WREG_TRACKER
    CONTEXT_SAVE after_#v(NUM_WHILEBIT)
    LOCAL bank_changed = BANKOF(after_bank);
bank_changed -= BANKOF(before_bank); line too long :(
;    EMIT ORG before_addr
;BANK_TRACKER = before_bank
;WREG_TRACKER = before_wreg
    CONTEXT_RESTORE before_#v(NUM_WHILEBIT)
    if after_idler == before_idler + 2; no idler, use tight busy-wait (3 instr)
    	ifbit reg, bitnum, bitval, GOTO before_idler; don't need to repeat banksel
	ERRIF($ != before_idler + 2, [ERROR] tight-while bit test size wrong: #v($ - (before_idler + 2)) @3594);
    else; jump around idler
	ifbit reg, bitnum, !BOOL2INT(bitval), GOTO around; check for *opposite* bit val
	ERRIF($ != before_idler + 2, [ERROR] bulky-while bit test size wrong: #v($ - (before_idler + 2)) @3597);
;	ORG after_addr
;BANK_TRACKER = after_bank
;WREG_TRACKER = after_wreg
	CONTEXT_RESTORE after_#v(NUM_WHILEBIT)
	GOTO IIF(bank_changed, loop, before_idler);
    endif
    EMITL around:
    EXPAND_POP
    endm


;; custom flow control opcodes ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;    LIST
;busy-wait functions:
;CAUTION: use only for small delays
;use Timer-based functions for longer delays (those allow cooperative multi-tasking)
;nop7_func: nop;
;nop6_func: nop;
;nop5_func: nop;
;CAUTION: each level falls thru to next and uses another stack level
;nop_functions macro
;next_init macro
;    init_chain; nop functions only need to be defined, not called; put other init first
;    previous_init;
;    goto around_nop
;around_nop:
;    endm
;INIT_COUNT += 1
;#undefine init_chain
;#define init_chain  nop_functions //initialization wedge for compilers that don't support static init
;    NOLIST

;use non-0 value for nop opcode:
;(allows code gap detection using real nop)
    messg TODO: vvv fix this @__LINE__
NOPNZ macro count
;BROKEN
;    if (count) & 1
;	addlw 0; benign non-0 opcode
;        NOP (count)-1
;	exitm
;    endif
    NOP count
    endm

    VARIABLE NOP_expanded = FALSE;
#define NOP  nop_multi; override default opcode for PCH checking and BSR, WREG tracking
NOP macro count;, dummy; dummy arg for usage with REPEAT
    EXPAND_PUSH FALSE
;    NOEXPAND; hide clutter
    LOCAL COUNT = count
    WARNIF(!COUNT, [WARNING] no nop? @3637)
;    if COUNT == 7
;	EMIT call nop#v(COUNT); special case for WS bit-banging
;	exitm
;    endif
    if COUNT & 1
;        EXPAND_RESTORE; NOEXPAND
;	PROGDCL 0; nop
	EMIT nop;
;	NOEXPAND
COUNT -= 1
    endif
    if COUNT && !NOP_expanded; avoid code unless needed; kludge: also avoids reset org conflict
;	doing_init TRUE
	LOCAL around
	goto around
nop#v(32): call nop#v(16)
nop#v(16): call nop#v(8)
;nop#v(8): nop ;call nop#v(4); 1 usec @8 MIPS
;nop#v(7): nop
;	  goto $+1
nop#v(8): call nop#v(4); 1 usec @8 MIPS
nop#v(4): return; 1 usec @4 MIPS
;    nop 1;,; 1 extra to preserve PCH
around:
;	doing_init FALSE
NOP_expanded = TRUE
COUNT -= 2; apply go-around towards delay period
    endif
    if COUNT & 2
;        EXPAND_RESTORE; NOEXPAND
        EMIT goto $+1; 1 instr, 2 cycles (saves space)
;	NOEXPAND
COUNT -= 2
    endif
;(small) multiples of 4:
;    if count >= 4
    if COUNT
;        EXPAND_RESTORE; NOEXPAND
	EMIT call nop#v(COUNT);
;	NOEXPAND
    endif
    EXPAND_POP
    endm


;conditional nop:
nopif macro want_nop, count
    if !BOOL2INT(want_nop)
	exitm
    endif
    NOP count
    endm

;nop2if macro want_nop
;    if want_nop
;	nop2
;    endif
;    endm

;nop4if macro want_nop
;    EXPAND_PUSH FALSE
;    if want_nop
;	EMIT NOP 4;,
;    endif
;    EXPAND_POP
;    endm


;simulate "call" opcode:
PUSH macro addr
;    EXPAND_PUSH FALSE
;    BANKCHK STKPTR;
;    BANKSAFE dest_arg(F) incf STKPTR;, F;
    INCF STKPTR, F
    mov16 TOS, addr; LITERAL(addr); NOTE: only h/w stack is only 15 bits wide
;    EXPAND_POP
    endm

;simulate "return" opcode:
POP macro
;    EXPAND_PUSH FALSE
;    BANKCHK STKPTR;
;    BANKSAFE dest_arg(F) decf STKPTR;, F;
    DECF STKPTR, F;
;    EXPAND_POP
    endm


;PUSHPOP macro addr
;    PUSH addr;
;    POP;
;    endm


;PIC code pages:
;#define PAGELEN  0x400
#define REG_PAGELEN  0x100  ;code at this address or above is paged and needs page select bits (8 bit address)
#define LIT_PAGELEN  0x800  ;code at this address or above is paged and needs page select bits (11 bit address)
;line too long    CONSTANT PAGELEN = 0X400;
;#define BANKOFS(reg)  ((reg) % BANKLEN)
;get page# of a code address:
;NOTE: there are 2 formats: literal (compile-time) and register-based (run-time)
#define LITPAGEOF(addr)  ((addr) / LIT_PAGELEN)  ;used for direct addressing (thru opcode)
#define REGPAGEOF(addr)  ((addr) / REG_PAGELEN)  ;used for indirect addressing (thru register)
;#define PROGDCL  EMIT da; put value into prog space; use for opcodes or packed read-only data
;
;back-fill code page:
;allows code to be generated < reset + isr
;    VARIABLE CODE_COUNT = 0;
;    VARIABLE CODE_HIGHEST = LIT_PAGELEN; start @eo page 0 and fill downwards
;CODE_HOIST macro len
;    if len == -1
;        EMITO ORG CODE_ADDR#v(CODE_COUNT)
;	exitm
;    endif
;    ERRIF(!len, [ERROR] code length len must be > 0, @3709);
;CODE_COUNT += 1
;    CONSTANT CODE_ADDR#v(CODE_COUNT) = $
;CODE_HIGHEST -= len
;    EMITO ORG CODE_HIGHEST
;;    messg code push: was #v(CODE_ADDR#v(CODE_COUNT)), is now #v(CODE_NEXT) @3714
;    endm

;CODE_POP macro
;    ORG CODE_ADDR#v(CODE_COUNT)
;    endm
 

;ensure PCLATH is correct:
PAGECHK MACRO dest; ;, fixit, undef_ok
    EXPAND_PUSH FALSE; reduce clutter in LST file
    if LITPAGEOF(dest) != LITPAGEOF(PAGE_TRACKER)
;??    if REGPAGEOF(dest) != REGPAGEOF(PAGE_TRACKER)
;	EMIT CLRF PCLATH; PAGESEL dest; kludge: mpasm doesn't want to pagesel
	EMIT MOVLP REGPAGEOF(dest); LITPAGEOF(dest); set all bits in case BRW/BRA used later
PAGE_TRACKER = dest;
PAGESEL_KEEP += 1
    else
PAGESEL_DROP += 1
    endif
    EXPAND_POP
    endm
    

;conditional call (to reduce caller verbosity):
CALLIF macro want_call, dest
    if want_call
        CALL dest;
    endif
    endm

    VARIABLE PAGE_TRACKER = ASM_MSB -1;
    VARIABLE PAGESEL_KEEP = 0, PAGESEL_DROP = 0; ;perf stats
#define CALL  call_pagesafe; override default opcode for PCH checking and BSR, WREG tracking
CALL macro dest
;    EXPAND_PUSH FALSE
;    NOEXPAND; hide clutter
    WARNIF(LITPAGEOF(dest), [ERROR] dest !on page 0: #v(LITPAGEOF(dest)) @3728)
;PAGESEL_DROP += 1
;    LOCAL WREG_SAVE = WREG_TRACKER
;    EXPAND_RESTORE; NOEXPAND
;    messg call dest, page tracker #v(PAGE_TRACKER), need page sel? #v(LITPAGEOF(dest)) != #v(LITPAGEOF(PAGE_TRACKER))? #v(LITPAGEOF(dest) != LITPAGEOF(PAGE_TRACKER))
;    if LITPAGEOF(dest) != LITPAGEOF(PAGE_TRACKER)
;	EMIT CLRF PCLATH; PAGESEL dest; kludge: mpasm doesn't want to pagesel
;PAGESEL_KEEP += 1
;    else
;PAGESEL_DROP += 1
;    endif
    PAGECHK dest
    EMIT call dest; PROGDCL 0x2000 | (dest); call dest
PAGE_TRACKER = dest;
;    NOEXPAND
    if (dest == nop#v(4)) || (dest == nop#v(8)); these don't alter BSR or WREG; TODO: choose a mechanism to indicate this
;        EXPAND_POP
	exitm
    endif
    DROP_CONTEXT; BSR and WREG unknown here
;    if dest == choose_next_color
;WREG_TRACKER = color; kludge: avoid unknown contents warning
;    endif
;#ifdef BITBANG
;    if dest == bitbang_wreg
;BANK_TRACKER = LATA; preserve caller context to improve timing
;    endif
;#endif
;    EXPAND_POP
    endm
;    messg ^^^ REINSTATE, @3757


#define GOTO  goto_pagesafe; override default opcode for PCH checking
GOTO macro dest
;    EXPAND_PUSH FALSE
; messg here1 @3763
    WARNIF(LITPAGEOF(dest), [ERROR] "dest" dest #v(dest) !on page 0: #v(LITPAGEOF(dest)) @3764)
    WARNIF(#v(eof) && !#v(dest), [WARNING] jump to 0 @3765);
; messg here2 @3766
;PAGESEL_DROP += 1
;    messg goto dest, page tracker #v(PAGE_TRACKER), need page sel? #v(LITPAGEOF(dest)) != #v(LITPAGEOF(PAGE_TRACKER))? #v(LITPAGEOF(dest) != LITPAGEOF(PAGE_TRACKER))
;    if LITPAGEOF(dest) != LITPAGEOF(PAGE_TRACKER)
;	EMIT CLRF PCLATH; PAGESEL dest; kludge: mpasm doesn't want to pagesel
;PAGESEL_KEEP += 1
;    else
;PAGESEL_DROP += 1
;    endif
    PAGECHK dest
;    EXPAND_RESTORE; NOEXPAND
; messg here3 @3776
    EMIT goto dest; PROGDCL 0x2000 | (dest); call dest
PAGE_TRACKER = dest;
; messg here4 @3779
;    NOEXPAND
;not needed: fall-thru would be handled by earlier code    DROP_CONTEXT; BSR and WREG unknown here if dest falls through
;    EXPAND_POP
    endm


eof_#v(EOF_COUNT) macro
    if PAGESEL_KEEP + PAGESEL_DROP
        messg [INFO] page sel: #v(PAGESEL_KEEP) (#v(pct(PAGESEL_KEEP, PAGESEL_KEEP + PAGESEL_DROP))%), dropped: #v(PAGESEL_DROP) (#v(pct(PAGESEL_DROP, PAGESEL_KEEP + PAGESEL_DROP))%) @3788; ;perf stats
    endif
    messg [INFO] page0 used: #v(EOF_ADDR)/#v(LIT_PAGELEN) (#v(pct(EOF_ADDR, LIT_PAGELEN))%) @3790
    endm
EOF_COUNT += 1;


;; startup code ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;special code addresses:
#ifndef RESET_VECTOR
 #define RESET_VECTOR  0; must be 0 for real code; shift for compile/dev debug ONLY
#endif
#define ISR_VECTOR  (RESET_VECTOR + 4); must be 4 for real code; shift for compile/dev debug ONLY
;#define ISR_RESERVED  2; space to reserve for (jump from) ISR

;init_#v(INIT_COUNT): DROP_CONTEXT; macro
    doing_init TRUE
;    EXPAND_PUSH FALSE
;NOTE: this code must be @address 0 in absolute mode
;pic-as, not mpasm: PSECT   code
    DROP_CONTEXT ;DROP_BANK
    EMIT ORG RESET_VECTOR; startup
    WARNIF($, [ERROR] reset code !@0: #v($) @3809);
    EMIT NOP 1; nop; reserve space for ICE debugger?
;    EMIT clrf PCLATH; EMIT pagesel $; paranoid
;    EMIT goto init_#v(INIT_COUNT + 1); init_code ;main
;    doing_init FALSE
;    messg reset pad #v(ISR_VECTOR - $) @3814
#ifdef WANT_ISR
    REPEAT LITERAL(ISR_VECTOR - $), NOP 1; nop; fill in empty space (avoids additional programming data block?); CAUTION: use repeat nop 1 to fill
    EMIT ORG ISR_VECTOR + WANT_ISR; ISR_RESERVED; reserve space for isr in case other opcodes are generated first
;    CONSTANT ISR_PLACEHOLDER = $;
#endif
;    EXPAND_POP
;    endm
;INIT_COUNT += 1
    doing_init FALSE


;VERY ugly kludge to help MPASM get back on track:
;this macro is needed because of page/bank optimization and the assembler's inability to handle that
;use this macro ahead of a label that gets an error 116 "Address label duplicated or different in second pass"
;there appear to be 2 main causes for this: pass 1 vs. pass 2 addresses out of sync, and LOCAL identifier name clashes
;the NEXT_UNIQID variable addresses the second of those causes, while this macro addresses the first one
;this macro can be used to pad out the address during pass 1, skipping it during pass 2 (or vice versa), so that the address is consistent between pass 1 + 2
;it's best to use it within dead code chunks (ie, AFTER a goto), where the extra instructions will NEVER be executed; this avoids any run-time overhead
;I'm not sure why symbolic addresses occassionally get out of alignment between pass 1 and pass 2; it's inconsistent - sometimes the assembler recovers correctly and sometimes not
;usage of this macro is trial and error; only add it in one place at a time, and adjust it until the error 116 goes away (use the .LST file to check the addresses in pass 1 vs. 2)
;if pass 1 address (LST) is higher than pass 2 address (symtab), use a +ve offset; this will put nop's in the final executable code
;if pass 1 address (LST) is less than pass 2 (symtab), use a -ve offset; this will only generate nop's in pass 1, and won't actually take up any code space in pass 2
;params:
; pass2ofs = amount to adjust; if pass 2 address > pass 1 address, use pass2ofs > 0; else use pass2ofs < 0; there can be errors in either direction
    VARIABLE PASS1_FIXUPS = 0, PASS2_FIXUPS = 0  ;used to track macro perf stats
UGLY_PASS12FIX MACRO pass2ofs
;    EXPAND_PUSH FALSE
;    NOEXPAND; reduce clutter
;    EXPAND_PUSH FALSE
    if (pass2ofs) < 0; slide pass 2 addresses down (pad pass 1 address up, actually)
	if !eof; only true during pass 1 (assembler hasn't resolved the address yet); eof label MUST be at end
	    REPEAT -(pass2ofs), nop; insert dummy instructions to move address during pass 1; these won't be present during pass 2
	endif
;		WARNIF eof, "[WARNING] Unneeded pass 1 fixup", pass2ofs, eof  ;won't ever see this message (output discarded during pass 1)
PASS1_FIXUPS += 0x10000-(pass2ofs)  ;lower word = #prog words; upper word = #times called
    endif
    if (pass2ofs) > 0; slide pass 2 addresses up
	if eof; only true during pass 2 (address resolved); eof label MUST be at end
	    REPEAT pass2ofs, nop;
	endif
	WARNIF(!eof, [WARNING] Unneeded #v(pass2ofs) pass 2 fixup @3884)
PASS2_FIXUPS += 0x10000+(pass2ofs)  ;lower word = #prog words; upper word = #times called
    endif
;    EXPAND_POP
;    EXPAND_POP
    ENDM

eof_#v(EOF_COUNT) macro
    if PASS1_FIXUPS + PASS2_FIXUPS
	messg [INFO] Ugly fixups pass1: #v(PASS1_FIXUPS/0x10000):#v(PASS1_FIXUPS%0x10000), pass2: #v(PASS2_FIXUPS/0x10000):#v(PASS2_FIXUPS%0x10000) @3893
    endif
    endm
EOF_COUNT += 1;

    EXPAND_POP
    LIST_POP
    messg end of hoist 1 @3900
;#else; too deep :(
#endif
#if HOIST == 0
    messg hoist 0: generic pic/asm helpers @4864
;#define LIST  NOLIST; too much .LST clutter, turn off for this section; also works for nested .inc file
;#define NOLIST  LIST; show everything in .LST clutter
    NOLIST; don't show this section in .LST file
    NOEXPAND
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; generic PIC/ASM helpers ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;bool macros:
#define TRUE  1
#define FALSE  0
#define BOOL2INT(val)  ((val) != 0); MPASM evaluates this to 0 or 1
;#define XOR(lrs, rhs)  ((lhs) && (rhs) || !(lhs) && !(rhs))
;for text messages:
#define YESNO(val)  YESNO_#v(BOOL2INT(val))
;broken:#define YESNO_#v(TRUE)  true
#define YESNO_1  true
;broken:#define YESNO_#v(FALSE)  false
#define YESNO_0  false
;ternary operator (like C/C++ "?:" operator):
;helps with compile-time optimizations
;line too long: #define IIF(TF, tval, fval)  (BOOL2INT(TF) * (tval) + (!BOOL2INT(TF)) * (fval))
;only eval TF once, but requires shorter fval (with no side effects):
;#define IIF(TF, tval, fval)  (BOOL2INT(TF) * ((tval) - (fval)) + (fval))
#define IIF(TF, tval, fval)  IIF_#v(BOOL2INT(TF))(tval, fval)
#define IIF_1(tval, fval)  (tval); IIF_#v(TRUE)
#define IIF_0(tval, fval)  (fval); IIF_#v(FALSE)


;misc arithmetic helpers:
#define rdiv(num, den)  (((num)+(den)/2)/MAX(den, 1))  ;rounded divide (at compile-time)
#define divup(num, den)  (((num)+(den)-1)/(den))  ;round-up divide
#define pct(num, den)  rdiv(100 * (num), den)
;#define err_rate(ideal, actual)  ((d'100'*(ideal)-d'100'*(actual))/(ideal))  ;%error
;#define mhz(freq)  #v((freq)/ONE_SECOND)MHz  ;used for text messages
;#define kbaud(freq)  #v((freq)/1000)kb  ;used for text messages
;#define sgn(x)  IIF((x) < 0, -1, (x) != 0)  ;-1/0/+1
#define ABS(x)  IIF((x) < 0, -(x), x)  ;absolute value
#define MIN(x, y)  IIF((x) < (y), x, y)  ;use upper case so it won't match text within ERRIF/WARNIF messages
#define MAX(x, y)  IIF((x) > (y), x, y)  ;use upper case so it won't match text within ERRIF/WARNIF messages

#define NULL_STMT  ORG $; dummy stmt for macros that need a parameter


;error/debug assertion message macros:
;******************************************************************************
;show error message if condition is true:
;params:
; assert = condition that must (not) be true
; message = message to display if condition is true (values can be embedded using #v)
;    messg [TODO] change to #def to preserve line# @3955
;ERRIF MACRO assert, message, args
;    NOEXPAND  ;hide clutter
;    if assert
;	error message, args
;    endif
;    EXPAND_RESTORE
;    ENDM
;use #def to preserve line#:
;#define ERRIF(assert, msg, args)  \
;    if assert \
;	error msg, args  \
;    endif
;mpasm doesn't allow #def to span lines :(
;#define ERRIF(assert, msg, args)  ERRIF_#v(BOOL2INT(assert)) msg, args
#define ERRIF(assert, msg)  ERRIF_#v(BOOL2INT(assert)) msg
#define ERRIF_0  IGNORE_EOL; msg_ignore, args_ignore  ;IGNORE_EOL; no ouput
#define ERRIF_1  error; (msg, args)  error msg, args
;show warning message if condition is true:
;params:
; assert = condition that must (not) be true
; message = message to display if condition is true (values can be embedded using #v)
;    messg [TODO] change to #def to preserve line# @3977
;WARNIF MACRO assert, message, args
;    NOEXPAND  ;hide clutter
;    if assert
;	messg message, args
;    endif
;    EXPAND_RESTORE
;    ENDM
;use #def to preserve line#:
;#define WARNIF(assert, msg, args)  \
;    if assert \
;	messg msg, args \
;    endif
;mpasm doesn't allow #def to span lines :(
;#define WARNIF(assert, msg, args)  WARNIF_#v(BOOL2INT(assert)) msg, args
#define WARNIF(assert, msg)  WARNIF_#v(BOOL2INT(assert)) msg
#define WARNIF_0  IGNORE_EOL; (msg_ignore, args_ignore)  ;IGNORE_EOL; no output
#define WARNIF_1  messg; (msg, args)  messg msg, args


;#define COMMENT(thing) ; kludge: MPASM doesn't have in-line comments, so use macro instead

;ignore remainder of line (2 args):
;    messg TODO: replace? IGNEOL @4000
;IGNORE_EOL2 macro arg1, arg2
;    endm
IGNORE_EOL macro arg
    endm


;#define WARNIF_1x(lineno, assert, msg, args)  WARNIF_1x_#v(BOOL2INT(assert)) lineno, msg, args
;kludge: MPASM doesn't provide 4008 so use current addr ($) instead:
;#define WARNIF_1x(assert, msg, args)  WARNIF_1x_#v(BOOL2INT(assert)) $, msg, args
;#define WARNIF_1x_0  IGNORE_EOL2; (msg_ignore, args_ignore)  ;IGNORE_EOL; no output
;#define WARNIF_1x_1  messg1x; (msg, args)  messg msg, args

;show msg 1x only per location:
;kludge: use addr since there's no way to get caller's line#
;TODO: figure out a better way to get lineno
;    VARIABLE NUM_MESSG1X = 0
;messg1x macro lineno, msg, args
;    EXPAND_PUSH FALSE
;    LOCAL already = 0
;    while already < NUM_MESSG1X
;	if WARNED_#v(already) == lineno
;	    EXPAND_POP
;	    exitm
;	endif
;already += 1
;    endw
;    messg msg, args @#v(lineno)
;    CONSTANT WARNED_#v(NUM_MESSG1X) = lineno
;NUM_MESSG1X += 1
;    EXPAND_POP
;    endm


;add to init code chain:
    VARIABLE INIT_COUNT = 0;
    VARIABLE LAST_INIT = -1;
doing_init macro onoff
    EXPAND_PUSH FALSE
;    messg [DEBUG] doing_init: onoff, count #v(INIT_COUNT), $ #v($), last #v(LAST_INIT), gap? #v($ != LAST_INIT) @4604; 
    if BOOL2INT(onoff); && INIT_COUNT; (LAST_INIT != -1); add to previous init code
;	LOCAL next_init = $
;	CONTEXT_SAVE before_init
;	ORG LAST_INIT; reclaim or backfill placeholder space
;	CONTEXT_RESTORE after_init
	if $ == LAST_INIT; continue from previous code block
	    CONTEXT_RESTORE last_init_#v(INIT_COUNT - 1)
	else; jump from previous code block
	    if INIT_COUNT; && ($ != LAST_INIT); IIF(LITPAGEOF(PAGE_TRACKER), $ + 2, $ + 1); LAST_INIT + 1; jump to next block
PAGE_TRACKER = LAST_INIT; kludge: PCLATH had to be correct in order to get there
		CONTEXT_SAVE next_init_#v(INIT_COUNT)
		CONTEXT_RESTORE last_init_#v(INIT_COUNT - 1)
		GOTO init_#v(INIT_COUNT); next_init
;	    ORG next_init
		CONTEXT_RESTORE next_init_#v(INIT_COUNT)
	    endif
	endif
	EMITL init_#v(INIT_COUNT):
;init_#v(INIT_COUNT): DROP_CONTEXT; macro
    else; end of init code (for now)
	CONTEXT_SAVE last_init_#v(INIT_COUNT)
	ORG IIF(LITPAGEOF(PAGE_TRACKER), $ + 2, $ + 1); leave placeholder for jump to next init section in case needed
LAST_INIT = $
;    EMIT goto init_#v(INIT_COUNT + 1); daisy chain: create next thread; CAUTION: use goto - change STKPTR here
INIT_COUNT += 1; 
    endif
    EXPAND_POP
    endm


;add to eof code chain:
    VARIABLE EOF_COUNT = 0;
;#define at_eof  REPEAT LITERAL(EOF_COUNT), EMITL at_eof_#v(REPEATER): eof_#v(REPEATER)
at_eof macro
;    EXPAND_PUSH FALSE
;;broken:    REPEAT EOF_COUNT, eof_#v(repeater)
;broken:    REPEAT LITERAL(EOF_COUNT), EMITL at_eof_#v(REPEATER): eof_#v(REPEATER)
    LOCAL count = 0;
    while count < EOF_COUNT
        EMITL at_eof_#v(count):; only used for debug
	eof_#v(count)
count += 1;
    endw
;    EXPAND_POP
    endm


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;macro expansion control:
;push/pop current directive, then set new value (max 31 nested levels)
;allows clutter to be removed from the .LST file
    VARIABLE MEXPAND_STACK = TRUE; default is ON (for caller, set at eof in this file)
;use this if more than 32 levels needed:
;    VARIABLE MEXPAND_STACKHI = 0, MEXPAND_STACKLO = 1; default is ON (for caller, set at eof in this file)
    VARIABLE MEXPAND_DEPTH = 0, MEXPAND_DEEPEST = 0
#define EXPAND_PUSH  EXPAND_CTL
#define EXPAND_POP  EXPAND_CTL -1
#define EXPAND_RESTORE  EXPAND_CTL 0xf00d
EXPAND_CTL MACRO onoffpop
    NOEXPAND; hide clutter in LST file
;    if (onoffpop) == 0xf00d; restore current setting
    if (onoffpop) >= 0; push on/off
	LOCAL pushpop = (MEXPAND_STACK + MEXPAND_STACK) / 2;
;	    if pushpop != MEXPAND_STACK; & ASM_MSB
;		messg [ERROR] macro expand stack too deep: #v(MEXPAND_DEPTH) @4099; allow continuation (!error)
;	    endif
	WARNIF(pushpop != MEXPAND_STACK, [ERROR] macro expand stack too deep: #v(MEXPAND_DEPTH) @5066); allow continuation (!error)
MEXPAND_STACK += MEXPAND_STACK + BOOL2INT(onoffpop); push: shift + add new value
MEXPAND_DEPTH += 1; keep track of current nesting level
MEXPAND_DEEPEST = MAX(MEXPAND_DEEPEST, MEXPAND_DEPTH); keep track of high-water mark
;use this if more than 32 levels needed:
;MEXPAND_STACKHI *= 2
;	if MEXPAND_STACKLO & ASM_MSB
;MEXPAND_STACKHI += 1
;MEXPAND_STACKLO &= ~ASM_MSB
;	endif
;    if !(onoff) ;leave it off
	if onoffpop
	    LIST; _PUSH pushpop; NOTE: must be on in order to see macro expansion
	endif
    else; pop or restore
        if (onoffpop) == -1; pop
;    LOCAL EXP_NEST = nesting -1  ;optional param; defaults to -1 if not passed
MEXPAND_STACK >>= 1; pop previous value (shift right)
MEXPAND_DEPTH -= 1; keep track of current nesting level
;only needed if reach 16 levels:
;	if MEXPAND_STACKLO & ASM_MSB  ;< 0
;MEXPAND_STACKLO &= ~ASM_MSB  ;1-MEXPAND_STACKLO  ;make correction for assembler sign-extend
;	endif
;use this if more than 32 levels needed:
;	if MEXPAND_STACKHI & 1
;MEXPAND_STACKLO += ASM_MSB
;	endif
;MEXPAND_STACKHI /= 2
;errif does this:
;	if !(MEXPAND_STACKLO & 1)  ;pop, leave off
;		EXITM
;	endif
;	    if MEXPAND_DEPTH < 0
;		messg [ERROR] macro expand stack underflow @4134; allow continuation (!error)
;	    endif
	    WARNIF(MEXPAND_DEPTH < 0, [ERROR] macro expand stack underflow @5101); allow continuation (!error)
;	    LIST_POP
	    if !(LSTCTL_STACK & 1)
		NOLIST
	    endif
	endif
    endif
    if !(MEXPAND_STACK & 1); leave it off
	exitm
    endif
    EXPAND; turn expand back on
    ENDM

eof_#v(EOF_COUNT) macro
    LOCAL nested = 0; 1; kludge: account for at_eof wrapper
    WARNIF(MEXPAND_DEPTH != nested, [WARNING] macro expand stack not empty @eof: #v(MEXPAND_DEPTH - nested)"," stack = #v(MEXPAND_STACK) @5116); mismatched directives can cause incorrect code gen
    endm
EOF_COUNT += 1;


;listing control:
;push/pop current directive, then set new value (max 31 nested levels)
;allows clutter to be removed from the .LST file
    VARIABLE LSTCTL_STACK = FALSE; default is OFF (for caller, set at eof in this file)
    VARIABLE LSTCTL_DEPTH = 0, LSTCTL_DEEPEST = 0
#define LIST_PUSH  LISTCTL
#define LIST_POP  LISTCTL -1
#define LIST_RESTORE  LISTCTL 0xfeed
LISTCTL MACRO onoffpop
    EXPAND_PUSH FALSE; hide clutter in LST file
;    if (onoffpop) == 0xfeed; restore current setting
    if (onoffpop) >= 0; push on/off
;	    messg list push @4168
	LOCAL pushpop = (LSTCTL_STACK + LSTCTL_STACK) / 2;
	WARNIF(pushpop != LSTCTL_STACK, [ERROR] list control stack too deep: #v(LSTCTL_DEPTH)"," @5135); allow continuation (!error)
LSTCTL_STACK += LSTCTL_STACK + BOOL2INT(onoffpop); push new value
LSTCTL_DEPTH += 1; keep track of current nesting level
LSTCTL_DEEPEST = MAX(LSTCTL_DEEPEST, LSTCTL_DEPTH); keep track of high-water mark
    else; pop or restore
        if (onoffpop) == -1; pop
;	    messg list pop @4176
LSTCTL_STACK >>= 1; pop previous value (shift right)
LSTCTL_DEPTH -= 1; keep track of current nesting level
	    WARNIF(LSTCTL_DEPTH < 0, [ERROR] list control stack underflow @5144); allow continuation (!error)
        endif
    endif
    if LSTCTL_STACK & 1; turn it on
	LIST
    else; turn it off
	NOLIST
    endif
    EXPAND_POP
    ENDM

eof_#v(EOF_COUNT) macro
    WARNIF(LSTCTL_DEPTH, [WARNING] list expand stack not empty @eof: #v(LSTCTL_DEPTH)"," stack = #v(LSTCTL_STACK) @5156); mismatched directives can cause incorrect code gen
    endm
EOF_COUNT += 1;


;show stmt in LST file even if LIST/EXPAND are off:
;used mainly for opcodes
;#define EMITD  LSTLINE_#v(0); initial state
;#define EMITO  LSTLINE_#v(0); initial state
;#define LSTLINE_0; leave as-is (off/on as handled by LST_CONTROL)
;#define MEXPAND_#v(mALL); leave as-is (all off/on handled by MEXPAND)
;LSTLINE_#v(TRUE) macro expr; turn expand on+off to show item in .LST
; messg here1 @4203
EMIT macro stmt
    EXPAND_PUSH TRUE; show expanded opc/data
    stmt
    EXPAND_POP
    endm

;left-justified version of above (for stmt with label):
EMITL macro stmt
    EXPAND_PUSH TRUE; show expanded opc/data
stmt
    EXPAND_POP
    endm


#if 0; LST control tests
    LIST_PUSH TRUE
    messg hello 1 @4220
    LIST_PUSH FALSE
    messg hello 0 @4222
    LIST_POP
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
test_expand macro aa, bb
;    EXPAND_PUSH FALSE
    LOCAL cc;broken = aa + bb
    EMITL cc = aa + bb
;  messg "cc" = cc @4229
    LOCAL dd = 1
    test_nested aa, bb, cc
    if cc < 0 
	EMIT movlw 0-cc & 0xff
    else
        EMIT movlw cc & 0xff
    endif
    movlw b'10101'
;    EXPAND_POP
    endm
test_nested macro arg1, arg2, arg3
    EXPAND_PUSH TRUE
;  messg "arg1" = arg1, "arg2" = arg2, "arg3" = arg3 @4242
    EMIT LOCAL ARG1 = arg1
    LOCAL ARG2 = arg2
    EXPAND_POP
    EMIT addlw arg1
    sublw arg2
    endm
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
#define RESET_VECTOR  60; kludge:allow compile
    test_expand 1, 2; 7cc
    LIST_PUSH FALSE
    test_expand 3, 4; 7cc
    LIST_POP
    LIST_POP
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
#endif; text


;vararg kludge:
;MPASM doesn't handle var args, so use wrappers :(
;#define _ARG(argg)  witharg_#v(argg)
#define bitnum_arg(argg)  withbit_#v(argg)
#define dest_arg(argg)  withdest_#v(argg)
#define val_arg(argg) showarg_#v(argg)
#define with_arg(argg)  witharg_#v(argg) ;//for arbitrary values
;yet-another-kludge: add instances as needed:
;add variants specifically for dest F/W:
;helps to recognize purpose in assembly/debug
dest_arg(W) macro stmt
    stmt, W;
    endm
; messg here @4273
;broken dest_arg(F) macro stmt
     messg TODO: fix this ^^^ vvv
withdest_1 macro stmt
    stmt, F;
    endm
;kludge-kludge: pre-generate wrappers for small values (bit# args):
#if 0; broken :(
    VARIABLE bitnum = 0;
    while bitnum < 8
bitnum_arg(bitnum) macro stmt
	stmt, bitnum;
	endm
bitnum += 1;
    endw
#else
bitnum_arg(0) macro stmt
    stmt, 0;
    endm
bitnum_arg(1) macro stmt
    stmt, 1;
    endm
bitnum_arg(2) macro stmt
    stmt, 2
    endm
bitnum_arg(3) macro stmt
    stmt, 3
    endm
bitnum_arg(4) macro stmt
    stmt, 4
    endm
bitnum_arg(5) macro stmt
    stmt, 5
    endm
bitnum_arg(6) macro stmt
    stmt, 6
    endm
bitnum_arg(7) macro stmt
    stmt, 7
    endm
#endif
;expand arg value then throw away (mainly for debug):
val_arg(0) macro stmt
    stmt
    endm

with_arg(0) macro stmt
    stmt, 0
    endm

;BROKEN:
;    EXPAND
;    VARIABLE small_arg = 0
;    while small_arg < 8
;;bitnum_arg(small_arg) macro stmt
;    messg #v(small_arg), witharg#v(small_arg) @4328
;witharg#v(small_arg) macro stmt
;    messg witharg#v(small_arg) stmt, #v(small_arg) @4330
;        stmt, #v(small_arg); CAUTION: force eval of small_arg here
;	endm
;small_arg += 1
;    endw
;    NOEXPAND


;repeat a statement the specified number of times:
;stmt can refer to "repeater" for iteration-specific behavior
;stmt cannot use more than 1 parameter (MPASM gets confused by commas; doesn't know which macro gets the params); use bitnum_arg() or other wrapper
;params:
; count = #times to repeat stmt
; stmt = statement to be repeated
;#define NOARG  0; dummy arg for stmts that don't want any
    VARIABLE REPEATER; move outside macro so caller can use it
REPEAT MACRO count, stmt; _arg1, arg2
;    EXPAND_PUSH FALSE
;    NOEXPAND  ;hide clutter
;?    EXPAND_PUSH FALSE
    LOCAL loop; must be outside if?
    if !ISLIT(count)
;        if $ < 10
;	    messg REPEAT: var count #v(count) @4353
;	endif
;        LOCAL loop
;        EXPAND_POP
	EMITL loop:	
	EMIT stmt;
;        EXPAND_PUSH FALSE
        BANKCHK count;
	PAGECHK loop; do this before decfsz
	BANKSAFE dest_arg(F) decfsz count;, F; CAUTION: 0 means 256
;	EXPAND_POP
	GOTO loop;
	exitm
    endif
    LOCAL COUNT;broken = LIT2VAL(count)
    EMITL COUNT = LIT2VAL(count)
    WARNIF(COUNT < 1, [WARNING] no repeat?"," count #v(COUNT) @5333)
    ERRIF(COUNT > 1000, [ERROR] repeat loop too big: count #v(COUNT) @5334)
;	if repeater > 1000  ;paranoid; prevent run-away code expansion
;repeater = count
;	    EXITM
;	endif
;    LOCAL repeater;broken = 0 ;count UP to allow stmt to use repeater value
;    EMITL repeater = 0 ;count UP to allow stmt to use repeater value
;    if $ < 10
;	messg REPEAT: const "count" #v(COUNT) @4377
;    endif
;    messg REPEAT: count, stmt;_arg1, arg2 @4379
REPEATER = 0;
    while REPEATER < COUNT  ;0, 1, ..., count-1
;	if arg == NOARG
;	    EXPAND_RESTORE  ;show generated code
;	    NOEXPAND  ;hide clutter
;	else
;	EXPAND_RESTORE  ;show generated code
;        EXPAND_PUSH TRUE
        EMIT stmt; _arg1, arg2
;        EXPAND_POP
;	NOEXPAND  ;hide clutter
;	endif
;	EMITL repeater += 1
REPEATER += 1
    endw
;    EXPAND_POP
    ENDM
;REPEAT macro count, stmt
;    NOEXPAND  ;hide clutter
;    REPEAT2 count, stmt,
;    endm


;init injection:
;not needed; just define a linked list of executable code (perf doesn't matter @startup)
;init macro
;    EXPAND_PUSH FALSE
;;broken    REPEAT INIT_COUNT, init_#v(repeater)
;init_code: DROP_CONTEXT
;    LOCAL count = 0;
;    while count < INIT_COUNT
;	init_#v(count)
;count += 1;
;    endw
;    EXPAND_POP
;    endm

eof_#v(EOF_COUNT) macro
    CONSTANT EOF_ADDR = $
eof:; only used for compile; this must go AFTER all executable code (MUST be a forward reference for pass 1); used to detect pass 1 vs. 2 for annoying error[116] fixups
    messg [INFO] optimization stats: @5385
    ERRIF(LITPAGEOF(EOF_ADDR), [ERROR] code page 0 overflow: eof @#v(EOF_ADDR) is past #v(LIT_PAGELEN)"," need page selects @5386); need to add page selects
;    EMIT sleep;
    endm
EOF_COUNT += 1;

    NOEXPAND
    NOLIST; reduce .LST clutter
    messg end of hoist 0 @5393
;#else; too deep :(
#endif
#if HOIST == 6
    messg epilog @5397
    NOLIST; don't show this section in .LST file
;; epilog ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;    init
;    cre_threads
;init_#v(INIT_COUNT): DROP_CONTEXT; macro
    doing_init TRUE;
    at_eof; include trailing code
    sleep; goto $; all code has run, now just wait for something to happen
;INIT_COUNT = -1; += 999; terminate init code chain
    doing_init FALSE;

;    variable @here = 3;
    
;    CONSTANT EOF_ADDR = $
;stkptr_#v(0) EQU stkptr_#v(NUM_THREADS); wrap-around for round robin yield
;start_thread_#v(0) EQU yield; 
;//sanity checks, perf stats:
;eof:  ;this must go AFTER all executable code (MUST be a forward reference); used to detect pass 1 vs. 2 for annoying error[116] fixups
;    messg [INFO] optimization stats: @4451
;    ERRIF(MEXPAND_DEPTH, [ERROR] missing #v(MEXPAND_DEPTH) MEXPAND_POP(s), @4452)
;    WARNIF(LSTCTL_DEPTH, [WARNING] list expand stack not empty @eof: #v(LSTCTL_DEPTH), top = #v(LSTCTL_STKTOP) @4453); can only detect ON entries, but good enough since outer level is off
;    messg [INFO] bank sel: #v(BANKSEL_KEEP) (#v(pct(BANKSEL_KEEP, BANKSEL_KEEP + BANKSEL_DROP))%), dropped: #v(BANKSEL_DROP) (#v(pct(BANKSEL_DROP, BANKSEL_KEEP + BANKSEL_DROP))%) @4454; ;perf stats
;    messg [INFO] bank0 used: #v(RAM_USED#v(0))/#v(RAM_LEN#v(0)) (#v(pct(RAM_USED#v(0), RAM_LEN#v(0)))%) @4455
;    MESSG [INFO] bank1 used: #v(RAM_USED#v(1))/#v(RAM_LEN#v(1)) (#v(pct(RAM_USED#v(1), RAM_LEN#v(1)))%) @4456
;    MESSG [INFO] non-banked used: #v(RAM_USED#v(NOBANK))/#v(RAM_LEN#v(NOBANK)) (#v(pct(RAM_USED#v(NOBANK), RAM_LEN#v(NOBANK)))%) @4457
;    messg [INFO] page sel: #v(PAGESEL_KEEP) (#v(pct(PAGESEL_KEEP, PAGESEL_KEEP + PAGESEL_DROP))%), dropped: #v(PAGESEL_DROP) (#v(pct(PAGESEL_DROP, PAGESEL_KEEP + PAGESEL_DROP))%) @4458; ;perf stats
;    messg [INFO] page0 used: #v(EOF_ADDR)/#v(LIT_PAGELEN) (#v(pct(EOF_ADDR, LIT_PAGELEN))%) @4459
;    MESSG "TODO: fix eof page check @4460"
;    messg [INFO] #threads: #v(NUM_THREADS), stack space needed: #v(STK_ALLOC), unalloc: #v(HOST_STKLEN - STK_ALLOC) @4461
;    messg [INFO] Ugly fixups pass1: #v(PASS1_FIXUPS/0x10000):#v(PASS1_FIXUPS%0x10000), pass2: #v(PASS2_FIXUPS/0x10000):#v(PASS2_FIXUPS%0x10000) @4462
;    ERRIF(LITPAGEOF(EOF_ADDR), [ERROR] code page 0 overflow: eof @#v(EOF_ADDR) is past #v(LIT_PAGELEN), need page selects @4463); need to add page selects
;    END

    NOLIST; reduce .LST clutter
    messg end of epilog @5432
#endif; HOIST 6
;#endif; HOIST 0
;#endif; HOIST 1
;#endif; HOIST 2
;#endif; HOIST 3
;#endif; HOIST 4
;#endif; HOIST 5
;#endif; HOIST 6
#endif; ndef HOIST    

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;hoist plumbing:
;generates bottom-up assembly code from the above top-down src code
;kludge: MPASM loses track of line#s if file is #included > 1x, so append # to make each unique
#ifndef HOIST
;#define END; "hide" except at outer layer
#define HOIST 1
#include __FILE__ 1; self
#undefine HOIST
#define HOIST 2
#include __FILE__ 2; self
#undefine HOIST
#define HOIST 3
#include __FILE__ 3; self
#undefine HOIST
#define HOIST 4
#include __FILE__ 4; self
#undefine HOIST
#define HOIST 5
#include __FILE__ 5; self
#undefine HOIST
#define HOIST 6
#include __FILE__ 6; self
#undefine HOIST
#define HOIST 7
#include __FILE__ 7; self
#undefine HOIST
;#undefine END; unhide for real eof
#endif; ndef HOIST
;eof control:
#ifdef HOIST
 #ifndef END
  #define END; prevent hoisted files from ending input
 #endif
#else
 #undefine END; allow outer file to end input
#endif; ndef HOIST
    END; eof, maybe
