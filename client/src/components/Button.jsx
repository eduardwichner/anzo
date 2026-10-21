// variant: primary | secondary | success | error | danger ; size: normal | big | small
export default function Button({ variant = 'primary', size = 'normal', block = false, className = '', ...props }) {
  const classes = ['btn'];
  if (variant !== 'primary') classes.push(`btn--${variant}`);
  if (size !== 'normal') classes.push(`btn--${size}`);
  if (block) classes.push('btn--block');
  if (className) classes.push(className);
  return <button type="button" className={classes.join(' ')} {...props} />;
}
