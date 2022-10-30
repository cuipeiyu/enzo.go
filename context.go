package enzogo

import (
	"encoding/json"

	"github.com/gorilla/websocket"
)

type Context struct {
	enzo *Enzo
	Conn *websocket.Conn
	payload
}

func (ctx *Context) GetData() string {
	return ctx.payload.Data
}

func (ctx *Context) Write(data string) error {
	var p = payload{
		MsgID: ctx.payload.MsgID,
		Way:   "back",
		Data:  data,
	}
	n, err := json.Marshal(p)
	if err != nil {
		return err
	}

	ctx.Conn.WriteMessage(websocket.TextMessage, n)
	return nil
}

func (ctx *Context) Emit(key string, data string, cb ...Handle) error {
	msgid := nanoid()
	eventid := msgid + "_response"

	var p = payload{
		MsgID: msgid,
		Key:   key,
		Way:   "post",
		Data:  data,
	}
	n, err := json.Marshal(p)
	if err != nil {
		return err
	}

	ctx.Conn.WriteMessage(websocket.TextMessage, n)

	if cb != nil {
		// wait back
		ctx.enzo.emitter.Once(eventid, func(d payload) {
			ictx := &Context{
				enzo:    ctx.enzo,
				Conn:    ctx.Conn,
				payload: d,
			}
			cb[0](ictx)
		})
	}

	return nil
}
