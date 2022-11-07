package enzogo

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

const (
	CloseMessage byte = 0x01

	PingMessage byte = 0x14
	PongMessage byte = 0x15
	_           byte = 0x16 // PluginMessage

	PostMessage byte = 0x28
	BackMessage byte = 0x29
)

type Handle func(*Context)

type payload struct {
	MsgType  byte
	MsgID    []byte
	Longtime bool
	Key      string
	Data     []byte
}

type Enzo struct {
	upgrader websocket.Upgrader

	emitter *Emitter

	lock           sync.Mutex
	events         []listener
	plugins        map[string]Plugin
	GenerateConnid func(r *http.Request) string
}

func New() *Enzo {
	return &Enzo{
		upgrader: websocket.Upgrader{
			CheckOrigin:     func(r *http.Request) bool { return true },
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			Subprotocols:    []string{"enzo-v0"},
		},
		emitter:        newEmitter(),
		lock:           sync.Mutex{},
		events:         []listener{},
		plugins:        map[string]Plugin{},
		GenerateConnid: DefaultGenerateConnid,
	}
}

func DefaultGenerateConnid(r *http.Request) string {
	connid := make([]byte, 10)
	rand.Read(connid)
	id := bytes2BHex(connid)
	return id
}

var _ http.Handler = (*Enzo)(nil)

func (enzo *Enzo) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	conn, err := enzo.upgrader.Upgrade(rw, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	// generate an id
	id := enzo.GenerateConnid(r)

	request := r.Clone(context.Background())

	enzo.emitter.Emit("connect", newContext(id, enzo, conn, request, payload{}))

	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			log.Println("read an error: ", err)
			enzo.emitter.Emit("disconnect", newContext(id, enzo, conn, request, payload{}))
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
				log.Println("mismatched body length")
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
					enzo.emitter.Emit(msgid, newContext(id, enzo, conn, request, res))
					return
				}
				// ! unhandled
				return
			}

			if len(body)-16 != allLength {
				// TODO
				// mismatched body length
				log.Println("mismatched body length")
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

			res.Data = body[offset : offset+dataLength]
			offset += dataLength

			if res.MsgType == BackMessage {
				enzo.emitter.Emit(msgid, newContext(id, enzo, conn, request, res))
				return
			}
			enzo.emitter.Emit(res.Key, newContext(id, enzo, conn, request, res))
		}(p)
	}
}

func (enzo *Enzo) On(key string, handle Handle) error {
	enzo.lock.Lock()
	defer enzo.lock.Unlock()

	id := enzo.emitter.On(key, handle)
	enzo.events = append(enzo.events, listener{
		key,
		id,
	})
	return nil
}

func (enzo *Enzo) Once(key string, handle Handle) error {
	enzo.emitter.Once(key, handle)
	return nil
}

func (enzo *Enzo) Off(key string) error {
	enzo.lock.Lock()
	defer enzo.lock.Unlock()

	tmp := []listener{}
	for _, l := range enzo.events {
		if l.key == key {
			enzo.emitter.RemoveListener(l.key, l.handle)
		} else {
			tmp = append(tmp, l)
		}
	}
	enzo.events = tmp

	return nil
}

func (enzo *Enzo) Use(plugins ...Plugin) {
	if plugins == nil {
		return
	}

	for _, p := range plugins {
		log.Println("register plugin:", p.Name())
		p.Install(enzo)
		enzo.plugins[p.Name()] = p
	}
}

type listener struct {
	key    string
	handle ListenerHandle
}
