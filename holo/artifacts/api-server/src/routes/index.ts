import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/bot", botRouter);
router.use("/dashboard", dashboardRouter);

export default router;
