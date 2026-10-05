# Native Authoring → KX Preparation Pipeline

This layer connects the semantic authoring compiler to the real compact-KX resolver.

`GameRecipe -> native authoring IR -> required real operator IDs -> target .kx class resolution -> safe class-table extension -> file-local commandIndex annotation`

The pipeline can now emit a modified target `.kx` whose **class table** contains every native operator needed by the authoring plan. It reparses the result and proves that the binary tail after the class table is unchanged.

This is a real binary write, but it is deliberately not called complete native game serialization. The pipeline still records:

- `emitsClassTableExtendedKx: true`
- `emitsNewOperatorInstances: false`
- `emitsNativeKxBinary: false`

The remaining authoring barrier is operator-instance serialization: op type/connection records, links, packed parameters, animation code, and any event/spline/blob references needed by newly created graph nodes.
