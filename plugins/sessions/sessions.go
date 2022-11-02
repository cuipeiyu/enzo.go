package sessions

import (
	"bytes"
	"encoding/binary"
	"errors"
	"log"
	"sync"
	"time"

	enzogo "github.com/cuipeiyu/enzo.go"
)

func New() *Sessions {
	return &Sessions{
		state: sync.Map{},
	}
}

type stateData struct {
	data     []byte
	expireAt *time.Time
}

type Sessions struct {
	state sync.Map
}

func (s *Sessions) Name() string {
	return "sessions"
}

func (s *Sessions) Install(enzo *enzogo.Enzo) {
	name := s.Name()

	enzo.On(name+"|set", s.onSet)
	enzo.On(name+"|get", s.onGet)
	enzo.On(name+"|ttl", s.onTTL)
	enzo.On(name+"|clean", s.onClean)

	enzo.On("close", s.remove)
}

func (s *Sessions) onSet(ctx *enzogo.Context) {
	offset := 0
	data := ctx.GetData()

	// parse data
	// ttl + keylen + key + datalen + data

	_ttl := data[offset : offset+4]
	offset += 4
	ttl := bytes2Int32(_ttl)

	_keylen := data[offset : offset+4]
	offset += 4
	keylen := bytes2Int32(_keylen)

	_key := data[offset : offset+int(keylen)]
	offset += int(keylen)
	key := string(_key)

	_bodylen := data[offset : offset+4]
	offset += 4
	bodylen := bytes2Int32(_bodylen)

	body := data[offset : offset+int(bodylen)]
	offset += int(bodylen)

	m := s.getStateMap(ctx)

	if ttl < 0 {
		m.Delete(key)
		return
	}

	tmp := &stateData{
		data:     body,
		expireAt: nil, // infinite
	}
	if ttl > 0 {
		t := time.Now().Add(time.Duration(ttl) * time.Second)
		tmp.expireAt = &t
	}
	m.Store(key, tmp)

	ctx.Write(s.normalBody(nil))
}

func (s *Sessions) onGet(ctx *enzogo.Context) {
	offset := 0
	data := ctx.GetData()

	// parse data
	// keylen + key

	_keylen := data[offset : offset+4]
	offset += 4
	keylen := bytes2Int32(_keylen)

	_key := data[offset : offset+int(keylen)]
	offset += int(keylen)
	key := string(_key)

	m := s.getStateMap(ctx)
	t, ok := m.Load(key)
	if !ok {
		ctx.Write(s.errorBody(errors.New("key not found 1")))
		return
	}
	if t == nil {
		m.Delete(key)
		ctx.Write(s.errorBody(errors.New("key not found 2")))
		return
	}
	item, ok := t.(*stateData)
	if !ok || item == nil {
		m.Delete(key)
		ctx.Write(s.errorBody(errors.New("key not found 3")))
		return
	}
	if item.expireAt != nil && time.Now().After(*item.expireAt) {
		m.Delete(key)
		ctx.Write(s.errorBody(errors.New("key not found 4")))
		return
	}

	ctx.Write(s.normalBody(item.data))
}

func (s *Sessions) onTTL(ctx *enzogo.Context) {
	offset := 0
	data := ctx.GetData()

	// parse data
	// ttl + keylen + key

	_ttl := data[offset : offset+4]
	offset += 4
	ttl := bytes2Int32(_ttl)

	_keylen := data[offset : offset+4]
	offset += 4
	keylen := bytes2Int32(_keylen)

	_key := data[offset : offset+int(keylen)]
	offset += int(keylen)
	key := string(_key)

	m := s.getStateMap(ctx)

	t, ok := m.Load(key)
	if !ok {
		if ttl < 0 {
			ctx.Write(s.normalBody(nil))
			return
		}
		ctx.Write(s.errorBody(errors.New("key not found")))
		return
	}
	if t == nil {
		m.Delete(key)
		if ttl < 0 {
			ctx.Write(s.normalBody(nil))
			return
		}
		ctx.Write(s.errorBody(errors.New("key not found")))
		return
	}
	item, ok := t.(*stateData)
	if !ok || item == nil {
		m.Delete(key)
		if ttl < 0 {
			ctx.Write(s.normalBody(nil))
			return
		}
		ctx.Write(s.errorBody(errors.New("key not found")))
		return
	}
	// already expired
	if item.expireAt != nil && time.Now().After(*item.expireAt) {
		m.Delete(key)
		if ttl < 0 {
			ctx.Write(s.normalBody(nil))
			return
		}
		ctx.Write(s.errorBody(errors.New("key not found")))
		return
	}

	if ttl > 0 {
		t := time.Now().Add(time.Duration(ttl) * time.Second)
		item.expireAt = &t
	}

	ctx.Write(s.normalBody(nil))
}

func (s *Sessions) onClean(ctx *enzogo.Context) {
	m := s.getStateMap(ctx)

	m.Range(func(key, _ any) bool {
		m.Delete(key)
		return true
	})

	ctx.Write(s.normalBody(nil))
}

func (s *Sessions) getStateMap(ctx *enzogo.Context) *sync.Map {
	connid := ctx.GetId()
	m, _ := s.state.LoadOrStore(connid, &sync.Map{})
	return m.(*sync.Map)
}

func (s *Sessions) remove(ctx *enzogo.Context) {
	connid := ctx.GetId()
	s.state.Delete(connid)
}

func (s *Sessions) normalBody(data []byte) []byte {
	var buf bytes.Buffer

	buf.WriteByte(0x01)

	// data length
	ml := make([]byte, 4)
	binary.LittleEndian.PutUint32(ml, uint32(len(data)))
	buf.Write(ml)

	buf.Write(data)

	return buf.Bytes()
}

func (s *Sessions) errorBody(err error) []byte {
	var buf bytes.Buffer

	buf.WriteByte(0x02)

	msg := err.Error()

	// message length
	ml := make([]byte, 4)
	binary.LittleEndian.PutUint32(ml, uint32(len(msg)))
	buf.Write(ml)

	buf.WriteString(msg)

	return buf.Bytes()
}

func bytes2Int32(b []byte) int32 {
	var i int32
	if len(b) == 4 {
		i |= int32(b[0])
		i |= int32(b[1]) << 8
		i |= int32(b[2]) << 16
		i |= int32(b[3]) << 24
	} else {
		log.Println("incorrect data length")
	}
	return i
}
