package enzogo

type Plugin interface {
	Name() string
	Install(*Enzo)
}
