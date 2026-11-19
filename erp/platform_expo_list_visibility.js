(function (root) {
  'use strict';
  // The exact 37 inactive coop ids in the retired 2026 expo registry, hashed
  // so these public static assets do not expose raw internal identifiers.
  const registered = new Set([
    '72f6bfbf395d1a02e3a7d3761e48d77362d4308f27e1080666e16dd8e8bdb485',
    '0bb68c4653131a58d3a00e3a571abe39ebe1576f1f899f8649b5051ec17a1fd9',
    '5d804ab9959e29b258e99983724212e09a05a627e52a89cbf2d38dece5a016c5',
    '004d89a30c2089a2b739ce081753702c30ea3fed9dd1330903512fd8591819e9',
    '306516fd425fefb58d21f8562dc3a163fce375cb01056b3bf5344667c3ed5b27',
    '645942790d7a1f486e6121ab0e84e58db6e7ac06a17cb27ded8d02f5c6ed989e',
    '4645c9fca3ca665508851008b17610890148cf564f2345153e0153d27ca53d3f',
    'ce642aac805bc6962359fb095d6ecd9fc3b3ac4d1723477e93c20ad719566dae',
    'e090d8dc1061d1d524caabf2bccd61d6f017070360781cca128a443a443de31c',
    '2b2e2c89b882487fe0120eae76c6b7e39513415a088ea108777e4b6b2854cd2f',
    'a105ff29a46f6d471b0fdb5413399d8b51dc49c8ad078f6022e5a07e6d11b18e',
    'fe01328f9f2eafda5c83199dee9f692dead0478667be4ca558b0433d6f34acd8',
    'c5fe1b03c34005272285e7aea58f33708faec5b9fbf6ed7ea9039ae9e7bb8980',
    '9f3c6a23919496be6e7830f255b6b85af88d3df4fb2eb0a381d46828cd093f84',
    '6b36879b5d86da298224d2abd3ca7bc06cce7126ba628327b6449e163da3b6b6',
    'd06d6b2124ede42a4a9ceec0d485c483dc53f740b99b634af74d383e229d45b7',
    '7bfba0a14313cb26457b826ce49412cc71210fbf0e3ffd5586adbe20ed92d70d',
    'cc7029c9afd0bd01a16fefeac5672edf66eff9d93704cf6372056714ea46192d',
    '12dce53ed64de6e50a1630e4294e7a04dda2b1f1a1c953c4158ac13cbdc56c43',
    '0a9c2980483201101eeeb8e6788826690065fd31e1298342ceae08529087c4f6',
    '50b8311e9bd5daf4a9a80875ce8180ef498d8fc767540f8fcf1299547042464a',
    '3ecc34220ddb7286a8c6e0bf47fe33357e66277fa94dc9a968e87f635a008bda',
    '4a707981f744ac2ffa7a64c7d0b1f27ed78e0d894cb5acd1754d5fb8f73b3560',
    '87f3e67f08278cf6bdf18a3a5f65751f0fe90763497b8ed2fce1e1af2890837f',
    'f443200d912874d034aaa7ed1be3a2b3670e87bb87c4cc1037ee4d41512d2f39',
    'f1ae1d4d26f9e8ed88221cc143428fbd9f7e467dc7495afec896f914bb1921ae',
    '1ae00967d1deb078628c1e0f6abb925029be3c3234d04559209b7c4ea7919afa',
    '282cdda1fefbdf270f272e8f891d41d6e9df08d378f1845e7401fb846c58224d',
    '670c353a00c3f5254b075323d608e8944bb2e48a22c7e4c0f907db467b16cc5a',
    'c93369ed4fe9bb23d454d75abfdab300d6b3d657ecb6822327d65a0d032fa99d',
    'bfb931a03ca808d3e38628d0920662e94ff1c2509d418ebfd28f190ebc56a601',
    'a95f5786dff0a0189ab28bdcc22f06e98b51aa99ac1639acf59a5ed8f18ee3bd',
    'ed9f473c3eb1be774e072a79a4048ddcf7dd1b859a69787b7b20abff0c3cb952',
    '29068d1ccd5dd2d4b02e44b5dea29c8e797a646e5346b5b63b1c63e21d2b2c3c',
    '99ac2c34d44a19badbf0c4b1d61f01a1f5cfe7bddc3972e4ef14c6b9951de8ba',
    'b89f309055ee8afb9e53fca668fcf73325fa1c419ea9dc6bd72d8e452352a4e6',
    'a3c53a1d21b97ae1395c490d78c73c27507e8bf8fa51a80f9d91c61bca179223',
  ]);
  const name = '박람회 체험조합';
  const encoder = new TextEncoder();
  async function isArchived(row, monitor) {
    if (row?.is_active !== false ||
        (monitor ? row.type !== 'coop' || row.label !== name + ' · 운영 중지' : row.coop_name !== name) ||
        typeof row.coop_id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.coop_id) ||
        !root.crypto?.subtle) return false;
    try {
      const digest = new Uint8Array(await root.crypto.subtle.digest('SHA-256', encoder.encode(row.coop_id.toLowerCase())));
      return registered.has(Array.from(digest, x => x.toString(16).padStart(2, '0')).join(''));
    } catch (_) { return false; }
  }
  async function visible(rows, monitor = false) {
    if (!Array.isArray(rows)) return [];
    const hide = await Promise.all(rows.map(row => isArchived(row, monitor)));
    return rows.filter((_, i) => !hide[i]);
  }
  root.CoopPlatformExpoVisibility = Object.freeze({ visible });
})(globalThis);
