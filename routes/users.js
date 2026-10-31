const express = require('express');
const User = require('../models/user');
const Task = require('../models/task');
const mongoose = require('mongoose');

module.exports = function () {
    const router = express.Router();
    const usersRoute = router.route('/');
    const usersIdRoute = router.route('/:id');

    function buildQuery(model, reqQuery) {
        let query = model.find();

        if (reqQuery.where) {
            query.where(JSON.parse(reqQuery.where));
        }
        if (reqQuery.sort) {
            query.sort(JSON.parse(reqQuery.sort));
        }
        if (reqQuery.select) {
            query.select(JSON.parse(reqQuery.select));
        }
        if (reqQuery.skip) {
            query.skip(parseInt(reqQuery.skip));
        }
        if (reqQuery.limit !== undefined) {
            const limit = parseInt(reqQuery.limit);
            if (limit > 0) query.limit(limit);
        }

        return query;
    }

    usersRoute.get(async (req, res) => {
        try {
            if (req.query.count === 'true' || req.query.count === true) {
                let filter = {};
                if (req.query.where) filter = JSON.parse(req.query.where);
                const count = await User.countDocuments(filter);
                return res.status(200).json({ message: "OK", data: count });
            }

            const query = buildQuery(User, req.query);
            const users = await query.exec();
            res.status(200).json({ message: "OK", data: users });
        } catch (err) {
            res.status(400).json({ message: "Bad Request", data: err.message });
        }
    });

    usersRoute.post(async (req, res) => {
        const { name, email } = req.body;
        const pendingTasks = req.body.pendingTasks || [];

        if (!name || !email) {
            return res.status(400).json({ message: "Name and Email are required", data: {} });
        }

        try {
            const existing = await User.findOne({ email });
            if (existing) {
                return res.status(400).json({ message: "Email already exists", data: {} });
            }

            for (let taskId of pendingTasks) {
                if (!mongoose.Types.ObjectId.isValid(taskId)) {
                    return res.status(400).json({ message: "Invalid task ID format", data: {} });
                }
            }

            for (let taskId of pendingTasks) {
                const task = await Task.findById(taskId);
                if (!task) {
                    return res.status(404).json({ message: "Task not found", data: {} });
                }
                if (task.completed) {
                    return res.status(400).json({ message: "Cannot assign completed task", data: {} });
                }
            }

            if (pendingTasks.length > 0) {
                await User.updateMany(
                    { pendingTasks: { $in: pendingTasks } },
                    { $pull: { pendingTasks: { $in: pendingTasks } } }
                );
            }

            const newUser = new User({ name, email, pendingTasks });
            const savedUser = await newUser.save();

            if (pendingTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: pendingTasks } },
                    { assignedUser: savedUser._id.toString(), assignedUserName: savedUser.name }
                );
            }

            res.status(201).json({ message: "User created", data: savedUser });
        } catch (err) {
            res.status(500).json({ message: "Server error", data: err.message });
        }
    });

    usersIdRoute.get(async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "User not found", data: {} });
        }
        try {
            const query = User.findById(req.params.id);
            if (req.query.select) {
                query.select(JSON.parse(req.query.select));
            }
            const user = await query.exec();
            if (!user) {
                return res.status(404).json({ message: "User not found", data: {} });
            }
            res.status(200).json({ message: "OK", data: user });
        } catch (err) {
            res.status(400).json({ message: "Bad Request", data: err.message });
        }
    });

    usersIdRoute.put(async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "User not found", data: {} });
        }

        const { name, email } = req.body;
        const pendingTasks = req.body.pendingTasks || [];

        if (!name || !email) {
            return res.status(400).json({ message: "Name and Email are required", data: {} });
        }

        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: "User not found", data: {} });
            }

            const emailUser = await User.findOne({ email, _id: { $ne: req.params.id } });
            if (emailUser) {
                return res.status(400).json({ message: "Email already in use", data: {} });
            }

            for (let taskId of pendingTasks) {
                if (!mongoose.Types.ObjectId.isValid(taskId)) {
                    return res.status(400).json({ message: "Invalid Task ID format", data: {} });
                }
            }

            for (let taskId of pendingTasks) {
                const task = await Task.findById(taskId);
                if (!task) {
                    return res.status(404).json({ message: "Task not found", data: {} });
                }
                if (task.completed) {
                    return res.status(400).json({ message: "Cannot assign completed task", data: {} });
                }
            }

            const oldTasks = user.pendingTasks || [];
            const newTasks = pendingTasks;

            const removedTasks = oldTasks.filter(t => !newTasks.includes(t));
            if (removedTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: removedTasks } },
                    { assignedUser: "", assignedUserName: "unassigned" }
                );
            }

            const addedTasks = newTasks.filter(t => !oldTasks.includes(t));
            if (addedTasks.length > 0) {
                await User.updateMany(
                    { _id: { $ne: req.params.id }, pendingTasks: { $in: addedTasks } },
                    { $pull: { pendingTasks: { $in: addedTasks } } }
                );
            }

            if (newTasks.length > 0) {
                await Task.updateMany(
                    { _id: { $in: newTasks } },
                    { assignedUser: user._id.toString(), assignedUserName: name }
                );
            }

            if (user.name !== name) {
                await Task.updateMany(
                    { assignedUser: user._id.toString() },
                    { assignedUserName: name }
                );
            }

            user.name = name;
            user.email = email;
            user.pendingTasks = newTasks;
            const updatedUser = await user.save();

            res.status(200).json({ message: "User updated", data: updatedUser });
        } catch (err) {
            res.status(500).json({ message: "Server error", data: err.message });
        }
    });

    usersIdRoute.delete(async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: "User not found", data: {} });
        }
        try {
            const user = await User.findByIdAndDelete(req.params.id);
            if (!user) {
                return res.status(404).json({ message: "User not found", data: {} });
            }

            await Task.updateMany(
                { assignedUser: req.params.id },
                { assignedUser: "", assignedUserName: "unassigned" }
            );

            return res.status(204).send();
        } catch (err) {
            res.status(500).json({ message: "Server error", data: err.message });
        }
    });

    return router;
};