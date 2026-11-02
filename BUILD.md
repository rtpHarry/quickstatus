# Development

ionic serve

# Deploy

Bump version in package.json

Commit:

chore(release): deploy vX.X.X

Then deploy to github page using:

npm run deploy

A pre deploy hook will automatically run `npm run build` before deployment.
