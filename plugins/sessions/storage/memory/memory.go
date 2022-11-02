package memory

import (
	"errors"
	"sync"
	"time"
)

func New() *Memory {
	return &Memory{data: map[string]*data{}}
}

type Memory struct {
	size int64
	mux  sync.Mutex
	data map[string]*data
}

func (m *Memory) Size() int64 {
	return m.size
}

func (m *Memory) Set(key string, val []byte, ttl int) error {
	m.mux.Lock()
	defer m.mux.Unlock()

	d, ok := m.data[key]

	if ttl < 0 && ok {
		m.size--
		d.removeTime()
		delete(m.data, key)
		return nil
	}

	if !ok {
		m.size++

		d = &data{
			data: val,
		}
	}

	if ttl > 0 {
		t := time.Now().Add(time.Duration(ttl) * time.Second)
		d.expire = &t
		d.timer = time.AfterFunc(time.Duration(ttl)*time.Second, func() {
			m.size--
			d.removeTime()
			delete(m.data, key)
		})
	}

	if !ok {
		m.data[key] = d
	}

	return nil
}

func (m *Memory) Get(key string) (val []byte, err error) {
	m.mux.Lock()
	defer m.mux.Unlock()

	d, ok := m.data[key]
	if !ok {
		err = errors.New("not found")
		return
	}

	// already expired
	if d.expire != nil && time.Now().After(*d.expire) {
		m.size--
		d.removeTime()
		delete(m.data, key)

		err = errors.New("not found")
		return
	}

	return d.data, nil
}

func (m *Memory) Del(key string) error {
	m.mux.Lock()
	defer m.mux.Unlock()

	d, ok := m.data[key]
	if !ok {
		return nil
	}

	m.size--
	d.removeTime()
	delete(m.data, key)

	return nil
}

func (m *Memory) TTL(key string, ttl int) error {
	m.mux.Lock()
	defer m.mux.Unlock()

	d, ok := m.data[key]
	if !ok {
		return errors.New("not found")
	}

	// delete
	if ttl < 0 {
		m.size--
		d.removeTime()
		delete(m.data, key)
		return nil
	}

	// already expired
	if d.expire != nil && time.Now().After(*d.expire) {
		m.size--
		d.removeTime()
		delete(m.data, key)
		return nil
	}

	if ttl == 0 {
		d.expire = nil
		if d.timer != nil {
			d.timer.Stop()
			d.timer = nil
		}
	}

	if ttl > 0 {
		t := time.Now().Add(time.Duration(ttl) * time.Second)
		d.expire = &t
		d.timer = time.AfterFunc(time.Duration(ttl)*time.Second, func() {
			m.size--
			d.removeTime()
			delete(m.data, key)
		})
	}

	return nil
}

func (m *Memory) RemoveAll() error {
	m.mux.Lock()
	defer m.mux.Unlock()

	for key, d := range m.data {
		m.size--
		d.removeTime()
		delete(m.data, key)
	}

	return nil
}

type data struct {
	data   []byte
	expire *time.Time
	timer  *time.Timer
}

func (d *data) removeTime() {
	if d.timer != nil {
		d.timer.Stop()
		d.timer = nil
	}
	d.expire = nil
}
