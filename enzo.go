package enzogo

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

type Enzo struct {
	upgrader websocket.Upgrader
}

func New() *Enzo {
	var upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	return &Enzo{
		upgrader,
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
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			log.Println(err)
			return
		}
		if err := conn.WriteMessage(messageType, p); err != nil {
			log.Println(err)
			return
		}
	}
}
