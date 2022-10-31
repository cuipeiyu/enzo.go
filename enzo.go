package enzogo

import (
	"encoding/binary"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

const (
	PingMessage byte = 0x1
	PongMessage byte = 0x2
	PostMessage byte = 0x28
	BackMessage byte = 0x29
)

type Handle func(*Context)

type payload struct {
	MsgType byte
	MsgID   []byte
	Key     string
	Data    string
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
			if body[0] == PingMessage {
				conn.WriteMessage(websocket.BinaryMessage, []byte{PongMessage, 0, 0, 0, 0})
				return
			}
			if body[0] == PongMessage {
				return
			}

			res := payload{}

			offset := 1

			// all len
			_allLength := body[offset : offset+4]
			allLength := int(binary.LittleEndian.Uint32(_allLength))
			log.Println("allLength", _allLength, allLength)
			if allLength != len(body) {
				log.Println("message length not match", allLength, len(body))
				return
			}
			offset += 4

			// msgid
			res.MsgID = body[offset : offset+10]
			log.Println("msgid", res.MsgID)
			msgid := bytes2BHex(res.MsgID)
			offset += 10

			// no key & data
			if offset == allLength {
				//
				if res.MsgType == BackMessage {
					enzo.emitter.Emit(msgid, res)
					return
				}
				// ! unhandled
				return
			}

			// key len
			_keyLength := body[offset : offset+4]
			keyLength := int(binary.LittleEndian.Uint32(_keyLength))
			log.Println("keyLength", _keyLength, keyLength)
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

			log.Printf("%#v", res)

			enzo.msgconn[msgid] = conn
			ictx := &Context{
				enzo:    enzo,
				Conn:    conn,
				payload: res,
			}
			enzo.emitter.Emit(res.Key, ictx)
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
