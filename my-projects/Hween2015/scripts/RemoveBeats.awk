#relabel beats, prep for XLNC
BEGIN{}
/Beat [0-9]+/ { next; }
{ print; }
END{}

