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
	return b.String()
}

func makeMsgId() string {
	b := make([]byte, 10)
	rand.Read(b)

	last := bytes2BHex(b)
	if len(last) != 10 {
		return makeMsgId()
	}
	return last
}

func bytes2BHex(r []byte) string {
	str := ""
	for _, t := range r {
		t &= 63
		if t < 36 {
			str += toBHex(t)
		} else if t < 62 {
			str += strings.ToUpper(toBHex(t - 26))
		} else if t > 62 {
			str += "-"
		} else {
			str += "_"
		}
	}
	return str
}
