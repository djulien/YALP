grep models:581 dj.txt | awk '{print $5 " " $6 " " $7 " " $8 " " $9 " " $10; }' | sort | uniq
