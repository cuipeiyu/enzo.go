package enzogo

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"

	"github.com/gorilla/websocket"
)

type Context struct {
	enzo *Enzo
	Conn *websocket.Conn
	payload
	err error
}

func (ctx *Context) IsError() bool {
	return ctx.err != nil
}

func (ctx *Context) Error() error {
	return ctx.err
}

func (ctx *Context) GetKey() string {
	return ctx.payload.Key
}

func (ctx *Context) GetData() string {
	return ctx.payload.Data
}

func (ctx *Context) Write(data []byte) {
	ctx.write(BackMessage, ctx.payload.MsgID, ctx.payload.Key, data, func(ctx *Context) {})
}

func (ctx *Context) write(msgType byte, msgid []byte, key string, data []byte, callback Handle) {
	if msgType == PingMessage || msgType == PongMessage {
		ctx.Conn.WriteMessage(websocket.BinaryMessage, []byte{msgType, 0, 0, 0, 0})
		return
	}

	allLength := 4

	// inout
	allLength += 1

	// msgid
	if msgid == nil {
		msgid = make([]byte, 10)
		rand.Read(msgid)
	}
	allLength += len(msgid)

	// key len + key
	allLength += 4 + len(key)

	// body len + body
	allLength += 4 + len(data)

	var buf bytes.Buffer

	buf.WriteByte(msgType)

	// all length
	al := make([]byte, 4)
	binary.LittleEndian.PutUint32(al, uint32(allLength))
	buf.Write(al)

	// msgid
	buf.Write(msgid)

	// key length
	kl := make([]byte, 4)
	binary.LittleEndian.PutUint32(kl, uint32(len(key)))
	buf.Write(kl)

	// key
	buf.WriteString(key)

	// data length
	dl := make([]byte, 4)
	binary.LittleEndian.PutUint32(dl, uint32(len(data)))
	buf.Write(dl)

	// data
	buf.Write(data)

	err := ctx.Conn.WriteMessage(websocket.BinaryMessage, buf.Bytes())
	if err != nil {
		ictx := &Context{
			enzo:    ctx.enzo,
			Conn:    ctx.Conn,
			payload: payload{},
			err:     err,
		}
		callback(ictx)
		return
	}

	eventid := bytes2BHex(msgid)
	// wait back
	ctx.enzo.emitter.Once(eventid, func(d payload) {
		ictx := &Context{
			enzo:    ctx.enzo,
			Conn:    ctx.Conn,
			payload: d,
		}
		callback(ictx)
	})
}

func (ctx *Context) Emit(key string, data []byte, cb ...Handle) error {
	msgid := make([]byte, 10)
	rand.Read(msgid)

	var callback Handle

	if cb == nil {
		callback = func(ctx *Context) {}
	} else {
		callback = cb[0]
	}

	ctx.write(PostMessage, msgid, key, data, callback)

	return nil
}
