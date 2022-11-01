package enzogo

import (
	"encoding/binary"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

const (
	CloseMessage byte = 0x01

	PingMessage byte = 0x14
	PongMessage byte = 0x15

	PostMessage byte = 0x28
	BackMessage byte = 0x29
)

type Handle func(*Context)

type payload struct {
	MsgType  byte
	MsgID    []byte
	Longtime bool
	Key      string
	Data     string
}

type Enzo struct {
	upgrader websocket.Upgrader

	emitter *Emitter
}

func New() *Enzo {
	return &Enzo{
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			Subprotocols:    []string{"enzo-v0"},
		},
		emitter: newEmitter(),
	}
}

var _ http.Handler = (*Enzo)(nil)

func (enzo *Enzo) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	conn, err := enzo.upgrader.Upgrade(rw, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			log.Println(err)
			return
		}

		// parse
		go func(body []byte) {
			if body == nil {
				return
			}
			if len(body) < 16 {
				// TODO
				// mismatched body length
				return
			}
			if body[0] == PingMessage {
				body[0] = PongMessage
				conn.WriteMessage(websocket.BinaryMessage, body)
				enzo.emitter.Emit("ping")
				return
			}
			if body[0] == PongMessage {
				// skip
				return
			}

			res := payload{}

			offset := 0

			// message type
			res.MsgType = body[0]
			offset += 1

			// longtime
			res.Longtime = body[offset] == 0x1
			offset += 1

			// msgid
			res.MsgID = body[offset : offset+10]
			msgid := bytes2BHex(res.MsgID)
			offset += 10

			// all len
			_allLength := body[offset : offset+4]
			allLength := int(binary.LittleEndian.Uint32(_allLength))
			offset += 4

			// no key & data
			if offset == 16 && allLength == 0 {
				//
				if res.MsgType == BackMessage {
					enzo.emitter.Emit(msgid, newContext(enzo, conn, res))
					return
				}
				// ! unhandled
				return
			}

			if len(body)-16 != allLength {
				// TODO
				// mismatched body length
				return
			}

			// key len
			_keyLength := body[offset : offset+4]
			keyLength := int(binary.LittleEndian.Uint32(_keyLength))
			offset += 4

			// key
			_key := body[offset : offset+keyLength]
			res.Key = string(_key)
			offset += keyLength

			// data
			_dataLength := body[offset : offset+4]
			dataLength := int(binary.LittleEndian.Uint32(_dataLength))
			offset += 4

			_data := body[offset : offset+dataLength]
			res.Data = string(_data)
			offset += dataLength

			if res.MsgType == BackMessage {
				enzo.emitter.Emit(msgid, newContext(enzo, conn, res))
				return
			}
			enzo.emitter.Emit(res.Key, newContext(enzo, conn, res))
		}(p)
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
