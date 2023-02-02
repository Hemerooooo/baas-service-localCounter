import SetCountRoute from "./setCountRoute/setCountRoute.js";
import SetCompanyRoute from "./setCreateCompany/createCompanyRoute.js";
import SetVaultRoute from "./setCreateVault/createVaultRoute.js";

const Routes = [].concat(SetCountRoute, SetCompanyRoute, SetVaultRoute);
export default Routes;
