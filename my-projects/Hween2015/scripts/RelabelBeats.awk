#relabel beats, prep for XLNC
BEGIN{}
{ line(); }
END{}
function line(VOID)
{
	if (NF == 3) $3 = "Beat " $3;
	print;
}
