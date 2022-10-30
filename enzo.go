package enzogo

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

type Handle func(*Context)

type payload struct {
	MsgID string `json:"msgid"`
	Key   string `json:"key,omitempty"`
	Way   string `json:"way"`
	Data  string `json:"data,omitempty"`
}

type Enzo struct {
	upgrader websocket.Upgrader

	emitter *Emitter

	msgconn map[string]*websocket.Conn
}

func New() *Enzo {
	return &Enzo{
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		emitter: newEmitter(),
		msgconn: map[string]*websocket.Conn{},
	}
}

var _ http.Handler = (*Enzo)(nil)

func (enzo *Enzo) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	conn, err := enzo.upgrader.Upgrade(rw, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

roll:
	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			log.Println(err)
			return
		}

	s:
		switch messageType {
		case websocket.TextMessage:
			// a json message
			if bytes.HasPrefix(p, []byte("{")) && bytes.HasSuffix(p, []byte("}")) {
				var d payload
				if err := json.Unmarshal(p, &d); err != nil {
					continue roll
				}

				if d.Way == "back" {
					enzo.emitter.Emit(d.MsgID+"_response", d)
				} else {
					enzo.msgconn[d.MsgID] = conn
					ictx := &Context{
						enzo:    enzo,
						Conn:    conn,
						payload: d,
					}
					enzo.emitter.Emit(d.Key, ictx)
				}
				continue roll
			}
			break s
		case websocket.BinaryMessage:
			// simulate ping & pong
			if bytes.Equal(p, []byte{0x9}) {
				// return pong
				_ = conn.WriteMessage(websocket.BinaryMessage, []byte{0xA})
			}
			continue roll
		}
		if err := conn.WriteMessage(messageType, p); err != nil {
			log.Println(err)
			return
		}
	}
}

func (enzo *Enzo) On(key string, handle Handle) error {
	enzo.emitter.On(key, handle)
	return nil
}

func (enzo *Enzo) Once(key string, handle Handle) error {
	enzo.emitter.Once(key, handle)
	return nil
}
