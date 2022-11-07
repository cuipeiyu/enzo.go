package sessions

import (
	"bytes"
	"encoding/binary"
	"errors"
	"log"
	"sync"

	enzogo "github.com/cuipeiyu/enzo.go"
)

const pluginName = "sessions"

type Storage interface {
	Size() int64
	Set(string, []byte, int) error
	Get(string) ([]byte, error)
	Del(string) error
	TTL(string, int) error
	RemoveAll() error
}

func New(store func() Storage) *Sessions {
	if store == nil {
		return nil
	}
	return &Sessions{
		state:    sync.Map{},
		newStore: store,
	}
}

func Load(ctx *enzogo.Context) (Storage, error) {
	p := ctx.GetPlugin(pluginName)
	if p == nil {
		return nil, errors.New("plugin \"" + pluginName + "\" not found")
	}
	t, ok := p.(*Sessions)
	if !ok {
		return nil, errors.New("plugin \"" + pluginName + "\" not a Sessions")
	}
	s := t.getStateMap(ctx)
	return s, nil
}

type Sessions struct {
	state    sync.Map
	newStore func() Storage
}

func (s *Sessions) Name() string {
	return pluginName
}

func (s *Sessions) Install(enzo *enzogo.Enzo) {
	name := s.Name()

	enzo.On(name+"|set", s.onSet)
	enzo.On(name+"|get", s.onGet)
	enzo.On(name+"|ttl", s.onTTL)
	enzo.On(name+"|sizes", s.onSizes)
	enzo.On(name+"|clean", s.onClean)

	enzo.On("disconnect", s.remove)
}

func (s *Sessions) onSet(ctx *enzogo.Context) {
	offset := 0
	data := ctx.GetData()

	// parse data
	// ttl + keylen + key + datalen + (dataType + data)

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

	err := m.Set(key, body, int(ttl))
	if err != nil {
		ctx.Write(s.errorBody(err))
		return
	}

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

	body, err := m.Get(key)
	if err != nil {
		ctx.Write(s.errorBody(err))
		return
	}

	ctx.Write(s.normalBody(body))
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

	err := m.TTL(key, int(ttl))
	if err != nil {
		ctx.Write(s.errorBody(err))
		return
	}

	ctx.Write(s.normalBody(nil))
}

func (s *Sessions) onSizes(ctx *enzogo.Context) {
	m := s.getStateMap(ctx)

	v := m.Size()

	al := make([]byte, 4)
	binary.LittleEndian.PutUint32(al, uint32(v))

	ctx.Write(s.normalBody(al))
}

func (s *Sessions) onClean(ctx *enzogo.Context) {
	m := s.getStateMap(ctx)

	m.RemoveAll()

	ctx.Write(s.normalBody(nil))
}

func (s *Sessions) getStateMap(ctx *enzogo.Context) Storage {
	connid := ctx.GetConnid()
	m, _ := s.state.LoadOrStore(connid, s.newStore())
	return m.(Storage)
}

func (s *Sessions) remove(ctx *enzogo.Context) {
	connid := ctx.GetConnid()
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
