// Awake's mark, a sunrise window in oak, keeps the brand's own colors in every theme.
import awakeMarkUrl from "../../../../assets/awake/awake-mark.svg";

export function AwakeMark(props: { readonly className?: string | undefined }) {
  return <img src={awakeMarkUrl} alt="" className={props.className} />;
}
