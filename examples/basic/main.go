package main

import (
	"log"
	"net/http"

	enzogo "github.com/cuipeiyu/enzo.go"
)

func main() {
	enzo := enzogo.New()

	http.Handle("/", http.StripPrefix("/", http.FileServer(http.Dir("."))))
	http.HandleFunc("/enzo.js", func(rw http.ResponseWriter, r *http.Request) {
		http.ServeFile(rw, r, "../../js-sdk/dist/index.iife.js")
	})
	http.HandleFunc("/ws", enzo.ServeHTTP)

	log.Println("listening at :90")
	http.ListenAndServe(":90", nil)
}
