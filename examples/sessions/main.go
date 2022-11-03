package main

import (
	"log"
	"net/http"

	enzogo "github.com/cuipeiyu/enzo.go"
	"github.com/cuipeiyu/enzo.go/plugins/sessions"
	"github.com/cuipeiyu/enzo.go/plugins/sessions/storage/memory"
)

func main() {
	enzo := enzogo.New()

	enzo.Use(
		sessions.New(func() sessions.Storage {
			return memory.New()
		}),
	)

	enzo.On("connect", func(ctx *enzogo.Context) {
		sess, err := sessions.Load(ctx)
		if err != nil {
			log.Println("can not get Sessions")
			return
		}

		sess.Set("isok", []byte{0x01}, 0)

		size := sess.Size()
		log.Println("got session size:", size)
	})

	http.Handle("/", http.StripPrefix("/", http.FileServer(http.Dir("."))))
	http.HandleFunc("/enzo.js", func(rw http.ResponseWriter, r *http.Request) {
		http.ServeFile(rw, r, "../../js-sdk/dist/index.es.js")
	})
	http.HandleFunc("/sessions.js", func(rw http.ResponseWriter, r *http.Request) {
		http.ServeFile(rw, r, "../../js-sdk/dist/plugins/sessions/index.es.js")
	})
	http.HandleFunc("/ws", enzo.ServeHTTP)

	log.Println("listening at :92")
	http.ListenAndServe(":92", nil)
}
