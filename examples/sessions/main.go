package main

import (
	"log"
	"net/http"

	enzogo "github.com/cuipeiyu/enzo.go"
	"github.com/cuipeiyu/enzo.go/plugins/sessions"
)

func main() {
	enzo := enzogo.New()
	enzo.Use(
		sessions.New(),
	)

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
