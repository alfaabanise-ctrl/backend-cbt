import WalletService from "../../service/wallet.service.js";

/*
|--------------------------------------------------------------------------
| Get All Wallets
|--------------------------------------------------------------------------
|
| GET /api/wallets
|
| Returns wallets for admin dashboard.
|
*/

export const getAllWallets = async (req, res) => {
  try {
    const {
      ownerType,
      status,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const result = await WalletService.getAllWallets({
      ownerType,
      status,
      search,
      page: Number(page),
      limit: Number(limit),
    });

    return res.status(200).json({
      success: true,
      message: "Wallets retrieved successfully",
      ...result,
    });
  } catch (error) {
    console.error("Get all wallets error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve wallets",
    });
  }
};


/*
|--------------------------------------------------------------------------
| Get Wallet Statistics
|--------------------------------------------------------------------------
|
| GET /api/wallets/statistics
|
*/

export const getWalletStatistics = async (req, res) => {
  try {
    const statistics =
      await WalletService.getWalletStatistics();

    return res.status(200).json({
      success: true,
      message: "Wallet statistics retrieved successfully",
      statistics,
    });
  } catch (error) {
    console.error("Get wallet statistics error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to retrieve wallet statistics",
    });
  }
};


/*
|--------------------------------------------------------------------------
| Get Single Wallet
|--------------------------------------------------------------------------
|
| GET /api/wallets/:walletId
|
*/

export const getWalletById = async (req, res) => {
  try {
    const { walletId } = req.params;

    const wallet =
      await WalletService.getWalletById(walletId);

    return res.status(200).json({
      success: true,
      message: "Wallet retrieved successfully",
      wallet,
    });
  } catch (error) {
    console.error("Get wallet error:", error);

    return res.status(404).json({
      success: false,
      message:
        error.message ||
        "Wallet not found",
    });
  }
};