package enzogo

import (
	"bytes"
	"crypto/rand"
	"strings"
)

var num2char = "0123456789abcdefghijklmnopqrstuvwxyz"

func toBHex(num byte) string {
	var b bytes.Buffer

	for num != 0 {
		yu := num % 36
		b.WriteByte(num2char[yu])
		num = num / 36
	}
	return strings.ToUpper(b.String())
}

func nanoid() string {
	b := make([]byte, 10)
	rand.Read(b)

	last := ""
	for _, t := range b {
		t &= 63
		if t < 36 {
			last += toBHex(t)
		} else if t < 62 {
			last += toBHex(t - 26)
		} else if t > 62 {
			last += "-"
		} else {
			last += "_"
		}
	}
	if len(last) != 10 {
		return nanoid()
	}
	return last
}
