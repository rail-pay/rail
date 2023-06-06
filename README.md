# Rail monorepo

`/packages`:
* `contracts`: Smart contracts for Rail Protocol
* `client`: Rail client
* `subgraph`: [TheGraph](https://thegraph.com/) subgraph for Rail smart contracts
* `join-server`: Base implementation of a HTTP server for requiring Rail beneciaries to fulfil certain requirements in order to join the Rail contract
* `default-join-server`: Simple HTTP server that adds beneficiaries who know a secret password, and gives them publish rights to the Vault's streams. Hosted by the Vault DAO at
  * TODO: does this play a role in Rail?

## Development

Monorepo is managed using [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). Integration tests are run in [Docker dev environment](https://github.com/streamr-dev/streamr-docker-dev/) and the configs are found in the [@rail-protocol/config NPM package](https://npmjs.com/package/@rail-protocol/config).

**Important:** Do not use `npm ci` or `npm install` directly in the sub-package directories, only in the root directory.

### Load project Node and npm
```
nvm use
```

### Bootstrap all sub-packages
The go to command for most use cases.

To install all required dependencies and build all sub-packages (linking sub-packages together as needed):

```bash
# from top level
npm run bootstrap
```

###  Bootstrap a single sub-package

To install the required dependencies and build a specific sub-package:

```bash
# from top level
npm run bootstrap-pkg --package=$PACKAGE_NAME
```

### Install dependencies only

To only install required dependencies and link sub-packages together (and skip build phase):

```bash
# from top level
npm ci
```

### Build
To build all sub-packages:
```bash
# from top level
npm run build
```

### Build a sub-package
To build a specific sub-package:
```bash
# from top level
npm run build --workspace=$PACKAGE_NAME
```

### Clear caches and built files

To clear all caches and remove the `dist` directory from each sub-package:

```bash
# from top level
npm run clean-dist
```

### Clean all

To removes all caches, built files, and **`node_modules`** of each sub-package, and the
top-level **`node_modules`**:

```bash
# from top level
npm run clean
```

### Add a dependency into a sub-package

Manually add the entry to the `package.json` of the sub-package and
run `npm run bootstrap-pkg $PACKAGE_NAME`.

Alternatively:
```bash
npm install some-dependency --workspace=$PACKAGE_NAME
```

### List active versions & symlinks

Check which sub-packages are currently being symlinked.

```bash
# from top level
npm run versions
```

This lists sub-packages & their versions on the left, linked
sub-packages are columns.  If the package on the left links to the package
in the column, it shows a checkmark & the semver range, otherwise it
shows the mismatched semver range and prints a warning at the end.  It
prints the version ranges so you can double-check that they're formatted
as you expect e.g. `^X.Y.Z` vs `X.Y.Z`

![image](https://user-images.githubusercontent.com/43438/135347920-97d6e0e7-b86c-40ff-bfc9-91f160ae975c.png)



Install dependencies:
```
npm ci
```

Build client:
```
cd packages/client
npm run build
```

Run tests:
```
npm run test
```

