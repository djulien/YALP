/mem:/ { rss = $4; total = $7; used = $9; avail = total - used; }
/latency:/ { lat = $2; flush(); }
function flush(VOID)
{
	print "latency: " lat ", mem rss " rss ", total " total ", used " used ", avail " avail;
}
