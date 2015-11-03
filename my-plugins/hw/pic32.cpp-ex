void init()
{
    config clock
    config SPI
    config UARTs
    config other pins
}

//global state:
byte* spi_bp;
uint16 delay;

#define NUM_PORTS  (5 + 3) //4.5 UART + 3 raw/parallel
//put buffer-specific status info within buffer so it goes back to master
struct
{
    uint16 spi_over, port_over, port_err;
    uint16 portlen[NUM_PORTS];
    byte* outptr[NUM_PORTS];
    byte* inptr[NUM_PORTS];
    byte data[4040], buffend[0];
} frames[2]; //double buffering: while master xfrs to one framebuf, port I/O uses other framebuf

//kludge: define dummy registers for non-existent hardware:
#define RX4_AVAILABLE  FALSE
#define RX5_AVAILABLE  FALSE
#define RX6_AVAILABLE  FALSE
#define RX7_AVAILABLE  FALSE

#define RCREG4  WREG
#define RCREG5  WREG
#define RCREG6  WREG
#define RCREG7  WREG

//kludge: use last half port as timer for raw port bits:
#define TX5_HASROOM  TX4_HASROOM
#define TX6_HASROOM  TX4_HASROOM
#define TX7_HASROOM  TX4_HASROOM

#define TXREG5  PORTA
#define TXREG6  PORTB
#define TXREG7  PORTC

#define FRAMEERR4  FALSE
#define FRAMEERR5  FALSE
#define FRAMEERR6  FALSE
#define FRAMEERR7  FALSE

#define portio(n)
{ \
    if (TX##n##_HASROOM) \
    { \
        if (port_outptr[n] < port_bufe[n]) TXREG##n = *port_outptr[n]++; \
    } \
    if (RX##n##_AVAILABLE) \
    { \
        if (FRAMEERR##n) ++port_err;
        if (port_inptr[n] < port_bufe[n]) *port_inptr[n]++ = RCREG##n; \
        else { WREG = RCREG##n; ++uart_over; } \
    } \
}

void main()
{
    init();
    
    for ()
    {
        if (SPI_CS) //CS rising edge; start SPI xfr from master
        {
            frames[0].spi_over = frames[0].port_over = frames[0].port_err = 0;
            spi_bp = frames[0].buffer; //point to start of next buffer
            while (SPI_CS) //xfr still in progress
            {
                if (SPI_AVAILABLE)
                {
                    if (spi_bp < frames[0].buffer[4000]) { SPI_OUT = *sbi_bp; *spi_bp++ = SPI_IN; }
                    else { SPI_OUT = 0xEE; WREG = SPI_IN; ++frames[0].overrun; }
                }

//first handle serial port I/O:
        portio(0);
        portio(1);
        portio(2);
        portio(3);
        portio(4);
        portio(5);
        portio(6);
        portio(7);

