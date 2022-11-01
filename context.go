package enzogo

import (
	"bytes"
	"encoding/binary"
	"time"

	"github.com/gorilla/websocket"
)

func newContext(enzo *Enzo, conn *websocket.Conn, payload payload) *Context {
	c := &Context{
		enzo:    enzo,
		Conn:    conn,
		payload: payload,
		replied: false,
	}

	if !payload.Longtime {
		c.timer = time.AfterFunc(3*time.Second, func() {
			if c.replied {
				return
			}

			c.timer = nil

			// reply default message
			c.write(BackMessage, false, c.payload.MsgID, c.payload.Key, nil, func(ctx *Context) {})
		})
	}

	return c
}

type Context struct {
	enzo *Enzo
	Conn *websocket.Conn
	payload
	err     error
	replied bool
	timer   *time.Timer
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
	ctx.replied = true

	if ctx.timer != nil {
		ctx.timer.Stop()
	}

	ctx.write(BackMessage, false, ctx.payload.MsgID, ctx.payload.Key, data, func(ctx *Context) {})
}

// make message frame
// * | base: (1+1+10=4=16) | messageType(1) | longtime(1) | messageId(10) | allLength(4) |
// ? | data: (4+x+4+x=y)   | keyLength(4)   | key(x)      | dataLength(4) | dataBody(x)  |
func (ctx *Context) write(msgType byte, longtime bool, msgid []byte, key string, data []byte, callback Handle) {
	if msgid == nil {
		msgid = makeMsgId()
	}

	if msgType == PongMessage {
		ctx.Conn.WriteMessage(websocket.BinaryMessage,
			append(
				append([]byte{msgType, 0}, msgid...),
				[]byte{0, 0, 0, 0}...,
			),
		)
		return
	}

	allLength := 16

	if len(key) > 0 {
		// key len + key
		allLength += 4 + len(key)

		// body len + body
		allLength += 4 + len(data)
	}

	var buf bytes.Buffer

	buf.WriteByte(msgType)

	if longtime {
		buf.WriteByte(0x1)
	} else {
		buf.WriteByte(0x0)
	}

	// msgid
	buf.Write(msgid)

	// all length
	al := make([]byte, 4)
	binary.LittleEndian.PutUint32(al, uint32(allLength))
	buf.Write(al)

	if len(key) > 0 {
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
	}

	if msgType == PostMessage {
		var timer *time.Timer
		eventid := bytes2BHex(msgid)

		// wait back
		handler := ctx.enzo.emitter.Once(eventid, func(ctx *Context) {
			timer.Stop()

			callback(ctx)
		})

		timer = time.AfterFunc(6*time.Second, func() {
			ctx.enzo.emitter.RemoveListener(eventid, handler)
		})
	}

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
}

func (ctx *Context) Emit(key string, data []byte, cb ...Handle) error {
	msgid := makeMsgId()

	var callback Handle

	if cb == nil {
		callback = func(ctx *Context) {}
	} else {
		callback = cb[0]
	}

	ctx.write(PostMessage, false, msgid, key, data, callback)

	return nil
}

func (ctx *Context) LongtimeEmit(key string, data []byte, cb ...Handle) error {
	msgid := makeMsgId()

	var callback Handle

	if cb == nil {
		callback = func(ctx *Context) {}
	} else {
		callback = cb[0]
	}

	ctx.write(PostMessage, true, msgid, key, data, callback)

	return nil
}
