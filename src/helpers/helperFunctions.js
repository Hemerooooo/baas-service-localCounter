import algosdk, { encodeUint64, makeBasicAccountTransactionSigner } from "algosdk";
import axios from "axios";
import createCompany from "../contracts/createCompany.js";
import clearCompany from "../contracts/clearCompany.js";
import createVault from "../contracts/createVault.js";
import clearVault from "../contracts/clearVault.js";
// import { unregisterDecorator } from "handlebars";

/**
 *
 * @param {String} token
 * @param {String} server
 * @param {Number} port
 */
export function connectToAlgorand(token, server, port) {
	console.log("=== CONNECT TO NETWORK ===");
	const algoClient = new algosdk.Algodv2(token, server, port);
	return algoClient;
}

export function getBlockchainAccount() {
	console.log("=== GET ACCOUNT ===");
	const account = algosdk.mnemonicToSecretKey(process.env.MNEMONIC);
	console.log("Account: " + account.addr);
	return account;
}

/**
 *
 * @param {String} algoClient
 * @param {Object} account
 * @param {Object} transaction
 * @param {Object} data
 * @param {any} signedTx
 * @param {Callback} callback
 */
export async function createAndSignTransaction(algoClient, account, transaction, data, signedTx, callback) {
	console.log("=== CREATE AND SIGN TRANSACTION ===");
	let suggestedParams, signed;
	await algoClient
		.getTransactionParams()
		.do()
		.then(async (value) => {
			suggestedParams = value;
			const appIndex = 103723509;
			const appArgs = [new Uint8Array(Buffer.from("set_number")), encodeUint64(parseInt(data.numberToSet))];
			transaction = algosdk.makeApplicationNoOpTxn(account.addr, suggestedParams, appIndex, appArgs);
			signedTx = await algosdk.signTransaction(transaction, account.sk);
			signed = signedTx;
		})
		.catch((err) => {
			return callback(err);
		});
	return signed;
}

/**
 *
 * @param {String} algoClient
 * @param {any} callback
 */
export async function sendTransaction(algoClient, signedTx, txnId, cb) {
	console.log("=== SEND TRANSACTION ===");
	await algoClient
		.sendRawTransaction(signedTx.blob)
		.do()
		.then((_txnId) => {
			txnId = _txnId;
			console.log(txnId);
			return;
		})
		.catch((e) => {
			return cb(e);
		});
	return cb();
}

/**
 *
 * @param {Object} payloadData
 * @param {any} cb
 */
export function respondToServer(payloadData, data, cb) {
	console.log("=== RESPOND TO SERVER ===");
	let service = payloadData;
	let destination = service.datashopServerAddress + "/api/job/updateJob";
	let lambdaInput;
	if (data) {
		lambdaInput = {
			insightFileURL: service.dataFileURL,
			jobid: service.jobID,
			returnData: data,
		};
	} else {
		lambdaInput = {
			insightFileURL: service.dataFileURL,
			jobid: service.jobID,
		};
	}
	axios.put(destination, lambdaInput).catch((e) => {
		cb(e);
	});
	console.log("=== JOB RESPONDED ===");
	return;
}

async function compileProgram(client, programSource) {
	let encoder = new TextEncoder();
	let programBytes = encoder.encode(programSource);
	let compileResponse = await client.compile(programBytes).do();
	let compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, "base64"));
	return compiledBytes;
}

function EncodeBytes(utf8String) {
	let enc = new TextEncoder();
	return enc.encode(utf8String);
}

// function DecodeBytes(uint8Array) {
// 	let dnc = new TextDecoder();
// 	return dnc.decode(uint8Array);
// }

function stringToLogicSig(logicSigString) {
	let logicSigArray = logicSigString.split(",");
	let logicSigBytes = new Uint8Array(logicSigArray);
	return algosdk.LogicSigAccount.fromByte(logicSigBytes);
}

export async function deployVault(algoClient, account, data) {
	console.log("=== DEPLOY VAULT CONTRACT ===");
	try {
		let params = await algoClient.getTransactionParams().do();
		let senderAddr = account.addr
		let counterProgram = await compileProgram(algoClient, createVault);
		let clearProgram = await compileProgram(algoClient, clearVault);
		let onComplete = algosdk.OnApplicationComplete.NoOpOC;

		let localInts = 0;
		let localBytes = 0;
		let globalInts = 2;
		let globalBytes = 3;

		let accounts = undefined;
		let foreignApps = undefined;
		let foreignAssets = undefined;
		let appArgs = [];
		appArgs.push(EncodeBytes(data.vaultName));

		let deployContract = algosdk.makeApplicationCreateTxn(
			senderAddr,
			params,
			onComplete,
			counterProgram,
			clearProgram,
			localInts,
			localBytes,
			globalInts,
			globalBytes,
			appArgs,
			accounts,
			foreignApps,
			foreignAssets
		);
		let signedTxn = deployContract.signTxn(account.sk);

		// Submit the transaction
		let tx = await algoClient.sendRawTransaction(signedTxn).do();
		let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 4);
		let transactionResponse = await algoClient.pendingTransactionInformation(tx.txId).do();
		let appId = transactionResponse["application-index"];

		// Print the completed transaction and new ID
		console.log("Transaction " + tx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);
		console.log("The application ID is: " + appId);
		let appAddr = await algosdk.getApplicationAddress(appId);
		console.log("The application wallet is: " + appAddr);
		await payAlgod(algoClient, account, appAddr, parseInt(data.funding));
		appId = "The application ID is: " + appId + ` Visit https://testnet.algoexplorer.io/application/${appId} to see the company`;
		return appId;
	} catch (err) {
		console.log(err);
	}
	process.exit();
}

export async function deployCompany(algoClient, account, data) {
	console.log("=== DEPLOY COMPANY CONTRACT ===");
	try {
		// let senderAccount = algosdk.mnemonicToSecretKey(process.env.MNEMONIC);
		let params = await algoClient.getTransactionParams().do();
		let senderAddr = account.addr
		let counterProgram = await compileProgram(algoClient, createCompany);
		let clearProgram = await compileProgram(algoClient, clearCompany);
		let onComplete = algosdk.OnApplicationComplete.NoOpOC;

		let localInts = 0;
		let localBytes = 0;
		let globalInts = 4;
		let globalBytes = 3 + data.founders.length;

		let accounts = [];
		let foreignApps = undefined;
		let foreignAssets = undefined;
		let appArgs = [];
		appArgs.push(EncodeBytes(data.companyName));

		for (const property in data.founders) {
			accounts.push(data.founders[property].wallet);
		}

		let deployContract = algosdk.makeApplicationCreateTxn(
			senderAddr,
			params,
			onComplete,
			counterProgram,
			clearProgram,
			localInts,
			localBytes,
			globalInts,
			globalBytes,
			appArgs,
			accounts,
			foreignApps,
			foreignAssets
		);
		let signedTxn = deployContract.signTxn(account.sk);

		// Submit the transaction
		let tx = await algoClient.sendRawTransaction(signedTxn).do();
		let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 4);
		let transactionResponse = await algoClient.pendingTransactionInformation(tx.txId).do();
		let appId = transactionResponse["application-index"];

		// Print the completed transaction and new ID
		console.log("Transaction " + tx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);
		console.log("The application ID is: " + appId);
		let appAddr = await algosdk.getApplicationAddress(appId);
		console.log("The application wallet is: " + appAddr);
		await payAlgod(algoClient, account, appAddr, parseInt(data.funding));
		let coinsId = await mintCoins(algoClient, account, appId, data.coins, data.vault);
		let sharesId = await mintShares(algoClient, account, appId, data.shares);
		await depositCoins(algoClient, account, appId, coinsId, data.vault);
		await distributeShares(algoClient, account, appId, sharesId, data.founders);
		appId = "The application ID is: " + appId + ` Visit https://testnet.algoexplorer.io/application/${appId} to see the company`;
		return appId;
	} catch (err) {
		console.log(err);
	}
	process.exit();
}

async function payAlgod(algoClient, senderAccount, receiver, amount) {
	console.log("=== fund contract ===");
	let params = await algoClient.getTransactionParams().do();
	let senderAddr = senderAccount.addr;
	let closeReminderTo = undefined;
	let note = undefined;
	let rekeyTo = undefined;
	let payment = algosdk.makePaymentTxnWithSuggestedParams(
		senderAddr,
		receiver,
		amount,
		closeReminderTo,
		note,
		params,
		rekeyTo);
	let signedTxn = payment.signTxn(senderAccount.sk);

	// Submit the transaction
	let tx = await algoClient.sendRawTransaction(signedTxn).do();
	let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 10);
	console.log(amount + " algod has been transferred from " + senderAddr + " to " + receiver + " in the transaction " + tx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);
}

async function mintShares(algoClient, senderAccount, companyId, sharesInfoArray) {
	console.log("=== mint company shares ===");
	let senderAddr = senderAccount.addr;
	let params = await algoClient.getTransactionParams().do();
	let operation = "mint_shares"
	let appArgs = [];
	appArgs.push(EncodeBytes(operation));
	for (const property in sharesInfoArray) {
		if (typeof sharesInfoArray[property] == "number") {
			appArgs.push(encodeUint64(sharesInfoArray[property]));
		}
		else {
			appArgs.push(EncodeBytes(sharesInfoArray[property]));
		}
	};
	let accounts = undefined;
	let foreignApps = undefined;
	let foreignAssets = undefined;
	let note = undefined;
	let lease = undefined;
	let rekeyTo = undefined;
	let boxes = undefined;
	let companyMintShres = algosdk.makeApplicationNoOpTxn(senderAddr, 
		params, 
		companyId, 
		appArgs, 
		accounts, 
		foreignApps, 
		foreignAssets, 
		note, 
		lease, 
		rekeyTo, 
		boxes);
	let signedTxn = companyMintShres.signTxn(senderAccount.sk);

	// Submit the transaction
	let tx = await algoClient.sendRawTransaction(signedTxn).do();
	let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 10);
	let transactionResponse = await algoClient.pendingTransactionInformation(tx.txId).do();
	let sharesId = transactionResponse["inner-txns"][0]['asset-index'];
	console.log(" Company has minted shares with an asset ID " + sharesId + " in the transaction " + tx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);
	return sharesId;
}

async function mintCoins(algoClient, senderAccount, companyId, coinsInfoArray, vaultInfoArray) {
	console.log("=== mint company coins ===");
	let senderAddr = senderAccount.addr;
	let params = await algoClient.getTransactionParams().do();
	let accounts = [];
	accounts.push(vaultInfoArray.wallet);
	let foreignApps = [];
	foreignApps.push(vaultInfoArray.ID);
	let operation = "mint_coins";
	let appArgs = [];
	appArgs.push(EncodeBytes(operation));
	for (const property in coinsInfoArray) {
		if (typeof coinsInfoArray[property] == "number") {
			appArgs.push(encodeUint64(coinsInfoArray[property]));
		}
		else {
			appArgs.push(EncodeBytes(coinsInfoArray[property]));
		}
	};
	let foreignAssets = undefined;
	let note = undefined;
	let lease = undefined;
	let rekeyTo = undefined;
	let boxes = undefined;
	let companyMintShares = algosdk.makeApplicationNoOpTxn(senderAddr, 
		params, 
		companyId, 
		appArgs, 
		accounts, 
		foreignApps, 
		foreignAssets, 
		note, 
		lease, 
		rekeyTo, 
		boxes);
	let signedTxn = companyMintShares.signTxn(senderAccount.sk);

	// Submit the transaction
	let tx = await algoClient.sendRawTransaction(signedTxn).do();
	let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 10);
	let transactionResponse = await algoClient.pendingTransactionInformation(tx.txId).do();
	let coinsId = transactionResponse["inner-txns"][0]['asset-index'];
	console.log(" Company has minted coins with an asset ID " + coinsId + " in the transaction " + tx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);
	return coinsId;
}

async function depositCoins(algoClient, senderAccount, companyId, coinsId, vaultInfoArray) {
	console.log("=== deposit company coins ===");
	let senderAddr = senderAccount.addr;
	let params = await algoClient.getTransactionParams().do();
	let accounts = [];
	accounts.push(vaultInfoArray.wallet);
	let appArgs = [];
	let operation = "deposit_coins";
	appArgs.push(EncodeBytes(operation));
	let foreignAssets = [];
	foreignAssets.push(coinsId);
	let foreignApps = undefined;
	let note = undefined;
	let rekeyTo = undefined;
	let lease = undefined;
	let boxes = undefined;
	let companyDepositCoins = algosdk.makeApplicationNoOpTxn(senderAddr, 
			params, 
			companyId, 
			appArgs, 
			accounts, 
			foreignApps, 
			foreignAssets, 
			note, 
			lease, 
			rekeyTo, 
			boxes);
	let signedTxn = companyDepositCoins.signTxn(senderAccount.sk);

	// Submit the transaction
	let tx = await algoClient.sendRawTransaction(signedTxn).do();
	let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 10);
	console.log("The deposit of coins has been finished at the transaction " + tx.txId + ", confirmed in round " + confirmedTxn["confirmed-round"]);
	}

async function distributeShares(algoClient, senderAccount, companyId, sharesId, founders) {
	console.log("=== distribute company shares ===");
	let senderAddr = senderAccount.addr;
	let params = await algoClient.getTransactionParams().do();
	let accounts = [];
	let sharesDistributionAmount = [];
	let foundersLogicSig = [];
	for (const property in founders) {
		accounts.push(founders[property].wallet);
		sharesDistributionAmount.push(founders[property].shares);
		foundersLogicSig.push(stringToLogicSig(founders[property].logicSigString))
	};
	let closeRemainderTo = undefined;
	let revocationTarget = undefined;
	let note = undefined;
	let rekeyTo = undefined;
	let gTxn = [];
	for (const property in accounts) {
		let account = accounts[property];
		gTxn.push(
			algosdk.makeAssetTransferTxnWithSuggestedParams(
				account,
				account,
				closeRemainderTo,
				revocationTarget,
				0,
				note,
				sharesId,
				params,
				rekeyTo)
		);
	};
	let appArgs = [];
	let operation = "distribute_shares";
	appArgs.push(EncodeBytes(operation));
	for (const property in sharesDistributionAmount) {
		appArgs.push(encodeUint64(sharesDistributionAmount[property]));
	};
	let foreignApps = undefined;
	let foreignAssets = [];
	foreignAssets.push(sharesId);
	let lease = undefined;
	let boxes = undefined;
	gTxn.push(
		algosdk.makeApplicationNoOpTxn(senderAddr, 
			params, 
			companyId, 
			appArgs, 
			accounts, 
			foreignApps, 
			foreignAssets, 
			note, 
			lease, 
			rekeyTo, 
			boxes)
	);
	// assign group id to transactions
	algosdk.assignGroupID(gTxn);
	let signedGTxn = [];
	for(const property in gTxn){
		if (property < gTxn.length - 1){
			signedGTxn.push(algosdk.signLogicSigTransaction(gTxn[property], foundersLogicSig[property]).blob);
		}
		else{
			signedGTxn.push(gTxn[property].signTxn(senderAccount.sk));
		}
	}

	// Submit the transaction
	let tx = await algoClient.sendRawTransaction(signedGTxn).do();
	let confirmedTxn = await algosdk.waitForConfirmation(algoClient, tx.txId, 10);
	console.log("The distribution of shares has been finished in a group of transaction that started from the optIn transaction of the founder1 at" + tx.txId + ", confirmed in round " + confirmedTxn["confirmed-round"]);
	// let transactionResponse = await algoClient.pendingTransactionInformation(tx.txId).do();
	// let groupIdUint8 = new Uint8Array(gTxn[0].group.buffer);
	// let groupId = DecodeBytes(groupIdUint8);
	// console.log("Founders have optIn to the shares and received shares from the company in a group of transactions with a group ID " + groupId);
}
