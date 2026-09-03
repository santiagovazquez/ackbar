import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        Ackbar no está afiliado con la Federación de Comercio, Disney ni Fantasy Flight Games. Los
        personajes, cartas, logos e ilustraciones de Star Wars pertenecen a Disney y/o Fantasy
        Flight Games.
      </p>
      <a
        className="site-footer-source"
        href="https://github.com/santiagovazquez/swu-compraventa"
        target="_blank"
        rel="noreferrer"
      >
        Proyecto open source
        <FontAwesomeIcon icon={faGithub} aria-hidden="true" />
        <span className="visually-hidden"> en GitHub</span>
      </a>
    </footer>
  );
}
