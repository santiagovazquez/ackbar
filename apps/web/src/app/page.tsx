export default function Home() {
  return (
    <main>
      <section className="hero">
        <p>Mercado de la comunidad</p>
        <h1>Las cartas encuentran a su próximo jugador.</h1>
        <p>
          Publicá singles de Star Wars Unlimited, hacé tu claim y construí tu reputación dentro de
          la comunidad.
        </p>
        <div className="actions">
          <a className="button" href="/vendo">
            Publicar venta
          </a>
          <a className="button secondary" href="/busco">
            Estoy buscando
          </a>
        </div>
      </section>
    </main>
  );
}
