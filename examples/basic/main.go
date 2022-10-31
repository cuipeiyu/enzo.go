package main

import (
	"log"
	"net/http"
	"time"

	enzogo "github.com/cuipeiyu/enzo.go"
)

func main() {
	enzo := enzogo.New()

	enzo.On("test", func(ctx *enzogo.Context) {
		// log.Printf("on test message: %s", ctx.Data)
		ctx.Write([]byte(`{"hello":"你好"}`))

		time.Sleep(2 * time.Second)

		ctx.Emit("boom", []byte("some content"), func(ctx *enzogo.Context) {
			log.Println("boom result", ctx.Data)

			ctx.Write([]byte("ok"))
		})
	})

	http.Handle("/", http.StripPrefix("/", http.FileServer(http.Dir("."))))
	http.HandleFunc("/enzo.js", func(rw http.ResponseWriter, r *http.Request) {
		http.ServeFile(rw, r, "../../js-sdk/dist/index.es.js")
	})
	http.HandleFunc("/ws", enzo.ServeHTTP)

	log.Println("listening at :90")
	http.ListenAndServe(":90", nil)
}
