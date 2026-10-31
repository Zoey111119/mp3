const express = require('express');
const Task = require('../models/task');
const User = require('../models/user');
const mongoose = require('mongoose');

module.exports = function () {
    const router = express.Router();
    const tasksRoute = router.route('/');
    const tasksIdRoute = router.route('/:id');

    function buildQuery(model, reqQuery) {
        let query = model.find();
        if (reqQuery.where) query.where(JSON.parse(reqQuery.where));
        if (reqQuery.sort) query.sort(JSON.parse(reqQuery.sort));
        if (reqQuery.select) query.select(JSON.parse(reqQuery.select));
        if (reqQuery.skip) query.skip(parseInt(reqQuery.skip));

        const limit = reqQuery.limit !== undefined ? parseInt(reqQuery.limit) : 100;
        if (limit > 0) query.limit(limit);

        return query;
    }

    tasksRoute.get(async (req, res) => {
        try {
            if (req.query.count === 'true' || req.query.count === true) {
                let filter = {};
                if (req.query.where) filter = JSON.parse(req.query.where);
                const count = await Task.countDocuments(filter);
                return res.status(200).json({ message: "OK", data: count });
            }

            const query = buildQuery(Task, req.query);
            const tasks = await query.exec();
            res.status(200).json({ message: "OK", data: tasks });
        } catch (err) {
            res.status(400).json({ message: "Bad Request", data: err.message });
        }
    });

    tasksRoute.post(async (req, res) => {
        const { name, description = "", deadline, completed = false, assignedUser = "", assignedUserName } = req.body;

        if (!name || !deadline) {
            return res.status(400).json({ message: "Name and Deadline are required", data: {} });
        }

        try {
            let user = null;
            if (assignedUser !== "") {
                if (!mongoose.Types.ObjectId.isValid(assignedUser)) {
                    return res.status(400).json({ message: "Invalid User ID format", data: {} });
                }
                user = await User.findById(assignedUser);
                if (!user) {
                    return res.status(404).json({ message: "Assigned user not found", data: {} });
                }
                if (assignedUserName !== undefined && assignedUserName !== "" && assignedUserName !== user.name) {
                    return res.status(400).json({ message: "assignedUserName does not match user name", data: {} });
                }
            } else {
                if (assignedUserName !== undefined && assignedUserName !== "" && assignedUserName !== "unassigned") {
                    return res.status(400).json({ message: "Invalid assignedUserName for unassigned task", data: {} });
                }
            }

            const newTask = new Task({
                name,
                description,
                deadline,
                completed,
                assignedUser,
                assignedUserName: user ? user.name : "unassigned"
            });

            const savedTask = await newTask.save();

            if (user && !completed) {
                await User.findByIdAndUpdate(user._id, { $addToSet: { pendingTasks: savedTask._id.toString() } });
            }

            res.status(201).json({ message: "Task created", data: savedTask });
        } catch (err) {
            res.status(500).json({ message: "Server error", data: err.message });
        }
    });

    tasksIdRoute.get(async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "Task not found", data: {} });
        }
        try {
            const query = Task.findById(req.params.id);
            if (req.query.select) query.select(JSON.parse(req.query.select));
            const task = await query.exec();
            if (!task) return res.status(404).json({ message: "Task not found", data: {} });
            res.status(200).json({ message: "OK", data: task });
        } catch (err) {
            res.status(400).json({ message: "Bad Request", data: err.message });
        }
    });

    tasksIdRoute.put(async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "Task not found", data: {} });
        }

        const { name, description = "", deadline, completed = false, assignedUser = "", assignedUserName } = req.body;

        if (!name || !deadline) {
            return res.status(400).json({ message: "Name and Deadline are required", data: {} });
        }

        try {
            const task = await Task.findById(req.params.id);
            if (!task) return res.status(404).json({ message: "Task not found", data: {} });

            let newUser = null;
            if (assignedUser !== "") {
                if (!mongoose.Types.ObjectId.isValid(assignedUser)) {
                    return res.status(400).json({ message: "Invalid User ID format", data: {} });
                }
                newUser = await User.findById(assignedUser);
                if (!newUser) {
                    return res.status(404).json({ message: "Assigned user not found", data: {} });
                }
                if (assignedUserName !== undefined && assignedUserName !== "" && assignedUserName !== newUser.name) {
                    return res.status(400).json({ message: "assignedUserName does not match assignedUser's name", data: {} });
                }
            } else {
                if (assignedUserName !== undefined && assignedUserName !== "" && assignedUserName !== "unassigned") {
                    return res.status(400).json({ message: "Invalid assignedUserName for unassigned task", data: {} });
                }
            }

            const oldUser = task.assignedUser;

            if (oldUser && oldUser !== "") {
                await User.findByIdAndUpdate(oldUser, { $pull: { pendingTasks: task._id.toString() } });
            }

            task.name = name;
            task.description = description;
            task.deadline = deadline;
            task.completed = completed;
            task.assignedUser = assignedUser;
            task.assignedUserName = newUser ? newUser.name : "unassigned";

            const updatedTask = await task.save();

            if (newUser && !completed) {
                await User.findByIdAndUpdate(newUser._id, { $addToSet: { pendingTasks: task._id.toString() } });
            }

            res.status(200).json({ message: "Task updated", data: updatedTask });
        } catch (err) {
            res.status(500).json({ message: "Server error", data: err.message });
        }
    });

    tasksIdRoute.delete(async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "Task not found", data: {} });
        }
        try {
            const task = await Task.findByIdAndDelete(req.params.id);
            if (!task) return res.status(404).json({ message: "Task not found", data: {} });

            if (task.assignedUser) {
                await User.findByIdAndUpdate(task.assignedUser, { $pull: { pendingTasks: task._id.toString() } });
            }

            return res.status(204).send();
        } catch (err) {
            res.status(500).json({ message: "Server error", data: err.message });
        }
    });

    return router;
};